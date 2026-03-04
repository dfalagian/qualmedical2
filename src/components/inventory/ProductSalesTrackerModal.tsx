import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Search, ShoppingCart, Package, ArrowRightLeft, TruckIcon, LogIn, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function ProductSalesTrackerModal() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as any).__salesTrackerTimeout);
    (window as any).__salesTrackerTimeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 400);
  };

  // Find matching products
  const { data: matchedProducts = [] } = useQuery({
    queryKey: ["sales_tracker_products", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand")
        .or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%`)
        .eq("is_active", true)
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  // Also search by batch number
  const { data: matchedBatches = [] } = useQuery({
    queryKey: ["sales_tracker_batches", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, product_id, products:product_id(id, name, sku, brand)")
        .ilike("batch_number", `%${debouncedSearch}%`)
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  // Combine product IDs from both searches
  const allProductIds = [
    ...matchedProducts.map((p: any) => p.id),
    ...matchedBatches.map((b: any) => b.product_id),
  ].filter((v, i, a) => a.indexOf(v) === i);

  // Fetch sales (quote_items from approved quotes)
  const { data: salesData = [], isLoading: loadingSales } = useQuery({
    queryKey: ["sales_tracker_sales", allProductIds],
    queryFn: async () => {
      if (allProductIds.length === 0) return [];
      const { data, error } = await supabase
        .from("quote_items")
        .select(`
          id, cantidad, precio_unitario, importe, nombre_producto, lote, marca,
          batch_id,
          quote_id,
          quotes:quote_id (
            id, folio, status, approved_at, fecha_cotizacion,
            clients:client_id (nombre_cliente)
          )
        `)
        .in("product_id", allProductIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Filter only approved/completed quotes
      return (data || []).filter(
        (item: any) => item.quotes?.status === "aprobada"
      );
    },
    enabled: open && allProductIds.length > 0,
  });

  // Fetch purchases (purchase_order_items from approved orders)
  const { data: purchasesData = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["sales_tracker_purchases", allProductIds],
    queryFn: async () => {
      if (allProductIds.length === 0) return [];
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(`
          id, quantity_ordered, quantity_received, unit_price,
          purchase_order_id,
          products:product_id(name, sku),
          purchase_orders:purchase_order_id (
            id, order_number, status, created_at, delivery_date, received_date,
            supplier_id, supplier_type
          )
        `)
        .in("product_id", allProductIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      const filtered = (data || []).filter(
        (item: any) => {
          const status = item.purchase_orders?.status;
          if (status === "cancelada") return false;
          if ((item.quantity_received || 0) > 0) return true;
          return ["aprobada", "recibida", "completada", "parcial"].includes(status);
        }
      );

      // Fetch supplier names for general suppliers
      const generalSupplierIds = [...new Set(
        filtered
          .filter((item: any) => item.purchase_orders?.supplier_type === 'general')
          .map((item: any) => item.purchase_orders?.supplier_id)
          .filter(Boolean)
      )] as string[];
      
      let generalSuppliersMap: Record<string, any> = {};
      if (generalSupplierIds.length > 0) {
        const { data: gs } = await supabase
          .from("general_suppliers")
          .select("id, razon_social, nombre_comercial")
          .in("id", generalSupplierIds);
        if (gs) gs.forEach((s: any) => { generalSuppliersMap[s.id] = s; });
      }

      // Fetch supplier names for registered suppliers
      const registeredSupplierIds = [...new Set(
        filtered
          .filter((item: any) => item.purchase_orders?.supplier_type !== 'general')
          .map((item: any) => item.purchase_orders?.supplier_id)
          .filter(Boolean)
      )] as string[];
      
      let registeredSuppliersMap: Record<string, any> = {};
      if (registeredSupplierIds.length > 0) {
        const { data: rs } = await supabase
          .from("profiles")
          .select("id, full_name, company_name")
          .in("id", registeredSupplierIds);
        if (rs) rs.forEach((s: any) => { registeredSuppliersMap[s.id] = s; });
      }

      return filtered.map((item: any) => {
        const suppId = item.purchase_orders?.supplier_id;
        const isGeneral = item.purchase_orders?.supplier_type === 'general';
        const supplier = isGeneral ? generalSuppliersMap[suppId] : registeredSuppliersMap[suppId];
        return {
          ...item,
          _supplier_name: isGeneral
            ? (supplier?.nombre_comercial || supplier?.razon_social || "—")
            : (supplier?.company_name || supplier?.full_name || "—")
        };
      });
    },
    enabled: open && allProductIds.length > 0,
  });

  // Fetch inventory entry movements (entradas directas)
  const { data: entriesData = [], isLoading: loadingEntries } = useQuery({
    queryKey: ["sales_tracker_entries", allProductIds],
    queryFn: async () => {
      if (allProductIds.length === 0) return [];
      const { data, error } = await supabase
        .from("inventory_movements")
        .select(`
          id, quantity, movement_type, created_at, notes, reference_type, reference_id, location,
          products:product_id(name, sku),
          profiles:created_by(full_name)
        `)
        .in("product_id", allProductIds)
        .eq("movement_type", "entrada")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && allProductIds.length > 0,
  });

  // Fetch transfers for these products
  const { data: transfersData = [], isLoading: loadingTransfers } = useQuery({
    queryKey: ["sales_tracker_transfers", allProductIds],
    queryFn: async () => {
      if (allProductIds.length === 0) return [];
      const { data, error } = await (supabase
        .from("warehouse_transfers")
        .select(`
          id, quantity, status, created_at, notes,
          from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(name),
          to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(name),
          products:product_id(name, sku),
          product_batches:batch_id(batch_number)
        `) as any)
        .in("product_id", allProductIds)
        .in("status", ["completada", "aprobada", "en_curso"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open && allProductIds.length > 0,
  });

  const isLoading = loadingSales || loadingPurchases || loadingTransfers || loadingEntries;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Search className="h-4 w-4" />
          Rastrear Producto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Rastreo de Producto — Ventas y Transferencias
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por SKU, nombre de producto o número de lote..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {debouncedSearch.length < 2 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Escribe al menos 2 caracteres para buscar
            </p>
          )}

          {debouncedSearch.length >= 2 && allProductIds.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No se encontraron productos con "{debouncedSearch}"
            </p>
          )}

          {allProductIds.length > 0 && (
            <>
              {/* Matched products summary */}
              <div className="flex flex-wrap gap-2">
                {matchedProducts.map((p: any) => (
                  <Badge key={p.id} variant="secondary" className="text-xs">
                    {p.sku} — {p.name}
                  </Badge>
                ))}
                {matchedBatches.map((b: any) => (
                  <Badge key={b.id} variant="outline" className="text-xs">
                    Lote: {b.batch_number} — {(b.products as any)?.name}
                  </Badge>
                ))}
              </div>

              {/* Totals summary */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 pb-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-3">
                      <LogIn className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total Entradas</p>
                        <p className="text-lg font-bold text-purple-700">
                          {entriesData.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)} uds
                        </p>
                        <p className="text-xs text-muted-foreground">{entriesData.length} movimiento(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <TruckIcon className="h-5 w-5 text-orange-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Órdenes de Compra</p>
                        <p className="text-lg font-bold text-orange-700">
                          {purchasesData.reduce((sum: number, item: any) => sum + (item.quantity_ordered || 0), 0)} uds
                        </p>
                        <p className="text-xs text-muted-foreground">{purchasesData.length} orden(es)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ShoppingCart className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total Vendido</p>
                        <p className="text-lg font-bold text-green-700">
                          {salesData.reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0)} uds
                        </p>
                        <p className="text-xs text-muted-foreground">{salesData.length} venta(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total Transferido</p>
                        <p className="text-lg font-bold text-blue-700">
                          {transfersData.reduce((sum: number, t: any) => sum + (t.quantity || 1), 0)} uds
                        </p>
                        <p className="text-xs text-muted-foreground">{transfersData.length} transferencia(s)</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Entries section */}
              <Collapsible>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardContent className="pt-4 pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <LogIn className="h-4 w-4 text-purple-600" />
                        Entradas de Inventario ({entriesData.length}) — {entriesData.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)} uds.
                        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                      </h3>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {entriesData.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No se encontraron entradas para este producto
                        </p>
                      ) : (
                        <ScrollArea className="h-[200px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Fecha</TableHead>
                                <TableHead className="text-xs">Producto</TableHead>
                                <TableHead className="text-xs text-right">Cantidad</TableHead>
                                <TableHead className="text-xs">Ubicación</TableHead>
                                <TableHead className="text-xs">Referencia</TableHead>
                                <TableHead className="text-xs">Registró</TableHead>
                                <TableHead className="text-xs">Notas</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entriesData.map((item: any) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-xs">
                                    {format(new Date(item.created_at), "dd/MM/yyyy", { locale: es })}
                                  </TableCell>
                                  <TableCell className="text-xs font-medium">
                                    {(item.products as any)?.name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {item.quantity}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {item.location || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {item.reference_type || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {(item.profiles as any)?.full_name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs max-w-[150px] truncate">
                                    {item.notes || "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Purchases section */}
              <Collapsible>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardContent className="pt-4 pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <TruckIcon className="h-4 w-4 text-orange-600" />
                        Compras ({purchasesData.length}) — {purchasesData.reduce((sum: number, item: any) => sum + (item.quantity_ordered || 0), 0)} uds.
                        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                      </h3>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {purchasesData.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No se encontraron compras para este producto
                        </p>
                      ) : (
                        <ScrollArea className="h-[200px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Fecha</TableHead>
                                <TableHead className="text-xs">Orden</TableHead>
                                <TableHead className="text-xs">Proveedor</TableHead>
                                <TableHead className="text-xs">Producto</TableHead>
                                <TableHead className="text-xs text-right">Pedido</TableHead>
                                <TableHead className="text-xs text-right">Recibido</TableHead>
                                <TableHead className="text-xs">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {purchasesData.map((item: any) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-xs">
                                    {item.purchase_orders?.created_at
                                      ? format(new Date(item.purchase_orders.created_at), "dd/MM/yyyy", { locale: es })
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {item.purchase_orders?.order_number || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {item._supplier_name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs font-medium">
                                    {(item.products as any)?.name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {item.quantity_ordered}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {item.quantity_received ?? "—"}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-xs">
                                      {item.purchase_orders?.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Sales section */}
              <Collapsible>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardContent className="pt-4 pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-green-600" />
                        Ventas ({salesData.length}) — {salesData.reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0)} uds.
                        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                      </h3>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {salesData.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No se encontraron ventas para este producto
                        </p>
                      ) : (
                        <ScrollArea className="h-[200px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Fecha Venta</TableHead>
                                <TableHead className="text-xs">Folio</TableHead>
                                <TableHead className="text-xs">Cliente</TableHead>
                                <TableHead className="text-xs">Producto</TableHead>
                                <TableHead className="text-xs">Lote</TableHead>
                                <TableHead className="text-xs text-right">Cantidad</TableHead>
                                <TableHead className="text-xs text-right">Importe</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {salesData.map((item: any) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-xs">
                                    {item.quotes?.approved_at
                                      ? format(new Date(item.quotes.approved_at), "dd/MM/yyyy", { locale: es })
                                      : item.quotes?.fecha_cotizacion
                                        ? format(new Date(item.quotes.fecha_cotizacion + "T00:00:00"), "dd/MM/yyyy", { locale: es })
                                        : "—"}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {item.quotes?.folio || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {(item.quotes?.clients as any)?.nombre_cliente || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs font-medium">
                                    {item.nombre_producto}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {item.lote || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {item.cantidad}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    ${item.importe?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Transfers section */}
              <Collapsible>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardContent className="pt-4 pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                        Transferencias ({transfersData.length}) — {transfersData.reduce((sum: number, t: any) => sum + (t.quantity || 1), 0)} uds.
                        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                      </h3>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {transfersData.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No se encontraron transferencias para este producto
                        </p>
                      ) : (
                        <ScrollArea className="h-[200px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Fecha</TableHead>
                                <TableHead className="text-xs">Origen</TableHead>
                                <TableHead className="text-xs">Destino</TableHead>
                                <TableHead className="text-xs">Producto</TableHead>
                                <TableHead className="text-xs">Lote</TableHead>
                                <TableHead className="text-xs text-right">Cantidad</TableHead>
                                <TableHead className="text-xs">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {transfersData.map((t: any) => (
                                <TableRow key={t.id}>
                                  <TableCell className="text-xs">
                                    {format(new Date(t.created_at), "dd/MM/yyyy", { locale: es })}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {t.from_warehouse?.name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {t.to_warehouse?.name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs font-medium">
                                    {t.products?.name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {t.product_batches?.batch_number || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {t.quantity || 1}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-xs">
                                      {t.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
