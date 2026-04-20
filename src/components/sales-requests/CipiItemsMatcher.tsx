import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Trash2, X, Warehouse, Package, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBatchWarehouses } from "@/hooks/useBatchWarehouses";

interface CipiItemsMatcherProps {
  requestId: string;
}

export function CipiItemsMatcher({ requestId }: CipiItemsMatcherProps) {
  const queryClient = useQueryClient();
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [localSelections, setLocalSelections] = useState<Record<string, { productId: string; productName: string } | null>>({});
  const [generalWarehouseId, setGeneralWarehouseId] = useState<string>("");
  const [showPerRowOverride, setShowPerRowOverride] = useState(false);
  const [applyingBulk, setApplyingBulk] = useState(false);
  const stableOrderRef = useRef<string[]>([]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["cipi-request-items", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cipi_request_items")
        .select("*, products(id, name, sku, brand, grupo_sat)")
        .eq("cipi_request_id", requestId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Active warehouses for the selector (kept for fallback / future use)
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active-cipi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Map: batch_id -> [{ warehouse_id, warehouse_name, quantity }]
  // Used to restrict the "Almacén" dropdown to only warehouses where the lote exists.
  const allBatchIdsInItems = useMemo(
    () => (items as any[]).map(i => i.batch_id).filter(Boolean) as string[],
    [items]
  );
  const { batchWarehousesMap } = useBatchWarehouses(allBatchIdsInItems);

  // All product IDs that are linked, so we can fetch their batches in one go
  const linkedProductIds = useMemo(
    () => Array.from(new Set((items as any[]).map(i => i.product_id).filter(Boolean) as string[])),
    [items]
  );

  // Batches for all linked products
  const { data: batchesByProduct = {} } = useQuery({
    queryKey: ["cipi-product-batches", linkedProductIds],
    enabled: linkedProductIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, product_id, batch_number, expiration_date, current_quantity")
        .in("product_id", linkedProductIds)
        .eq("is_active", true)
        .gt("current_quantity", 0)
        .order("expiration_date", { ascending: true });
      if (error) throw error;
      const grouped: Record<string, Array<{ id: string; batch_number: string; expiration_date: string; current_quantity: number }>> = {};
      (data || []).forEach(b => {
        if (!grouped[b.product_id]) grouped[b.product_id] = [];
        grouped[b.product_id].push(b);
      });
      return grouped;
    },
  });

  const sortedItems = useMemo(() => {
    if (!items.length) return items;
    const currentIds = items.map((i: any) => i.id);
    const storedIds = stableOrderRef.current;
    const sameSet = storedIds.length === currentIds.length &&
      currentIds.every((id: string) => storedIds.includes(id));
    if (!sameSet) {
      stableOrderRef.current = currentIds;
      return items;
    }
    const orderMap = new Map(storedIds.map((id, idx) => [id, idx] as const));
    return [...items].sort((a: any, b: any) =>
      (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
    );
  }, [items]);

  const { data: products = [] } = useQuery({
    queryKey: ["all-products-for-matching"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand, grupo_sat, current_stock")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleProductMatch = async (itemId: string, productId: string, productName: string) => {
    try {
      setLocalSelections(prev => ({ ...prev, [itemId]: { productId, productName } }));
      setOpenPopoverId(null);
      setSearchTerm("");

      const { error } = await supabase
        .from("cipi_request_items")
        .update({ product_id: productId, matched_product_name: productName, batch_id: null })
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
      setLocalSelections(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err: any) {
      setLocalSelections(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      toast.error(err.message || "Error al vincular producto");
    }
  };

  const handleClearMatch = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .update({ product_id: null, matched_product_name: null, batch_id: null })
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
      toast.success("Línea eliminada");
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    }
  };

  const handleClearLote = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .update({ lote: null, batch_id: null })
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
      toast.success("Lote eliminado");
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar lote");
    }
  };

  const handleSelectBatch = async (itemId: string, batchId: string | null) => {
    try {
      // When the batch changes, clear warehouse_id because it may no longer be valid
      // for the new lote (a warehouse that held lote A might not hold lote B).
      let updates: any = { batch_id: batchId, warehouse_id: null };
      if (batchId) {
        // Find batch info to also save the lot text + expiration
        const allBatches = Object.values(batchesByProduct).flat() as Array<{ id: string; batch_number: string; expiration_date: string }>;
        const batch = allBatches.find(b => b.id === batchId);
        if (batch) {
          updates.lote = batch.batch_number;
          updates.caducidad = batch.expiration_date;
        }
      } else {
        updates.lote = null;
      }
      const { error } = await supabase
        .from("cipi_request_items")
        .update(updates)
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
    } catch (err: any) {
      toast.error(err.message || "Error al seleccionar lote");
    }
  };

  const handleSelectWarehouse = async (itemId: string, warehouseId: string | null) => {
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .update({ warehouse_id: warehouseId })
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
    } catch (err: any) {
      toast.error(err.message || "Error al seleccionar almacén");
    }
  };

  // Bulk apply: set the same warehouse to every item that has the lote available in that warehouse
  const applyWarehouseToAll = async (warehouseId: string) => {
    if (!warehouseId) return;
    const eligibleItemIds: string[] = [];
    const skipped: string[] = [];
    for (const it of items as any[]) {
      if (!it.product_id || !it.batch_id) continue;
      const available = batchWarehousesMap[it.batch_id] || [];
      const found = available.find(w => w.warehouse_id === warehouseId);
      if (found && found.quantity >= (it.cantidad || 0)) {
        eligibleItemIds.push(it.id);
      } else {
        skipped.push(it.descripcion || it.matched_product_name || "ítem");
      }
    }
    if (eligibleItemIds.length === 0) {
      toast.warning("Ningún ítem tiene stock suficiente del lote en ese almacén");
      return;
    }
    setApplyingBulk(true);
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .update({ warehouse_id: warehouseId })
        .in("id", eligibleItemIds);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
      const msg = `Almacén aplicado a ${eligibleItemIds.length} ítem(s)`;
      if (skipped.length > 0) {
        toast.success(`${msg}. ${skipped.length} omitido(s) por stock insuficiente.`);
      } else {
        toast.success(msg);
      }
    } catch (err: any) {
      toast.error(err.message || "Error al aplicar almacén");
    } finally {
      setApplyingBulk(false);
    }
  };

  // When user picks general warehouse, auto-apply to all eligible items
  useEffect(() => {
    if (generalWarehouseId) {
      applyWarehouseToAll(generalWarehouseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalWarehouseId]);

  const categoryColors: Record<string, string> = {
    MEDICAMENTOS: "bg-blue-100 text-blue-800",
    ONCOLOGICOS: "bg-red-100 text-red-800",
    INMUNOTERAPIA: "bg-purple-100 text-purple-800",
    SOLUCIONES: "bg-cyan-100 text-cyan-800",
    INSUMOS: "bg-orange-100 text-orange-800",
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay productos extraídos.</p>;

  const itemsWithBatch = (items as any[]).filter(i => i.batch_id).length;
  const itemsWithWarehouse = (items as any[]).filter(i => i.warehouse_id).length;

  return (
    <div className="space-y-2">
      {/* General warehouse selector */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium">Almacén general (aplica a todos):</span>
          <Select value={generalWarehouseId} onValueChange={setGeneralWarehouseId} disabled={applyingBulk}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="Elegir almacén para todos..." />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map(w => (
                <SelectItem key={w.id} value={w.id} className="text-xs">
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-[10px]">
            {itemsWithWarehouse}/{itemsWithBatch} con almacén
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => setShowPerRowOverride(v => !v)}
          >
            <Settings2 className="h-3 w-3 mr-1" />
            {showPerRowOverride ? "Ocultar override por fila" : "Override por fila"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Al elegir un almacén aquí, se aplicará automáticamente a todos los ítems que tengan stock suficiente del lote en ese almacén. Use "Override por fila" solo para excepciones.
        </p>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        Vincule cada renglón a un producto del catálogo y seleccione lote.
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Cat.</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[110px]">Marca</TableHead>
              <TableHead className="w-[55px]">Cant.</TableHead>
              <TableHead className="w-[80px]">P. Unit.</TableHead>
              <TableHead className="w-[80px]">Precio</TableHead>
              <TableHead className="w-[230px]">Producto inventario</TableHead>
              <TableHead className="w-[160px]">Lote</TableHead>
              {showPerRowOverride && <TableHead className="w-[150px]">Almacén</TableHead>}
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((item: any) => {
              const productBatches = item.product_id ? (batchesByProduct[item.product_id] || []) : [];
              const hasProduct = !!item.product_id;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.categoria && (
                      <Badge variant="outline" className={cn("text-[10px] px-1", categoryColors[item.categoria])}>
                        {item.categoria.substring(0, 4)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.matched_product_name || item.descripcion}
                    {item.matched_product_name && item.matched_product_name !== item.descripcion && (
                      <span className="block text-[10px] text-muted-foreground line-through">
                        {item.descripcion}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{item.marca || "—"}</TableCell>
                  <TableCell className="text-xs text-center">{item.cantidad}</TableCell>
                  <TableCell className="text-xs text-right">
                    ${Number(item.precio_unitario).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">
                    ${Number(item.precio).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Popover
                      open={openPopoverId === item.id}
                      onOpenChange={(open) => {
                        setOpenPopoverId(open ? item.id : null);
                        if (!open) setSearchTerm("");
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "w-full justify-between text-xs h-7",
                            (item.product_id || localSelections[item.id]) && "border-green-300 bg-green-50"
                          )}
                        >
                          <span className="truncate">
                            {localSelections[item.id]
                              ? localSelections[item.id]!.productName
                              : item.product_id
                                ? (item.products?.name || item.matched_product_name || "Vinculado")
                                : "Seleccionar..."}
                          </span>
                          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Buscar producto..."
                            className="text-xs"
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                          />
                          <CommandList>
                            <CommandEmpty>No encontrado.</CommandEmpty>
                            <CommandGroup className="max-h-[200px] overflow-auto">
                              {item.product_id && (
                                <CommandItem
                                  onSelect={() => handleClearMatch(item.id)}
                                  className="text-xs text-destructive"
                                >
                                  ✕ Quitar vinculación
                                </CommandItem>
                              )}
                              {(() => {
                                const term = searchTerm.toLowerCase().trim();
                                const filtered = term
                                  ? products.filter((p: any) =>
                                      p.name.toLowerCase().includes(term) ||
                                      p.sku.toLowerCase().includes(term) ||
                                      (p.brand && p.brand.toLowerCase().includes(term)) ||
                                      (p.grupo_sat && p.grupo_sat.toLowerCase().includes(term))
                                    )
                                  : products.slice(0, 50);
                                return filtered.slice(0, 50).map((product: any) => (
                                  <CommandItem
                                    key={product.id}
                                    value={product.id}
                                    onSelect={() => handleProductMatch(item.id, product.id, product.name)}
                                    className="text-xs"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-1 h-3 w-3",
                                        (item.product_id === product.id || localSelections[item.id]?.productId === product.id) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="truncate font-medium">{product.name}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        SKU: {product.sku}
                                        {product.brand && ` | ${product.brand}`}
                                        {product.current_stock != null && ` | Stock: ${product.current_stock}`}
                                      </div>
                                    </div>
                                  </CommandItem>
                                ));
                              })()}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </TableCell>

                  {/* Batch selector */}
                  <TableCell>
                    {hasProduct ? (
                      <Select
                        value={item.batch_id || "none"}
                        onValueChange={(v) => handleSelectBatch(item.id, v === "none" ? null : v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <div className="flex items-center gap-1 truncate">
                            <Package className="h-3 w-3 shrink-0" />
                            <SelectValue placeholder="Lote..." />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="max-h-[280px]">
                          <SelectItem value="none">— Sin lote —</SelectItem>
                          {productBatches.length === 0 && (
                            <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                              Sin lotes con stock
                            </div>
                          )}
                          {productBatches.map((b) => (
                            <SelectItem key={b.id} value={b.id} className="text-xs">
                              {b.batch_number} · Cad: {b.expiration_date} · Stk: {b.current_quantity}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : item.lote ? (
                      <span className="flex items-center gap-1 text-xs">
                        {item.lote}
                        <button
                          onClick={() => handleClearLote(item.id)}
                          className="text-destructive hover:text-destructive/80 p-0.5 rounded"
                          title="Eliminar lote"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Vincule producto primero</span>
                    )}
                  </TableCell>

                  {/* Warehouse selector per row — only when override toggle is on */}
                  {showPerRowOverride && (
                    <TableCell>
                      {(() => {
                        if (!hasProduct) {
                          return <span className="text-[10px] text-muted-foreground italic">Vincule producto</span>;
                        }
                        if (!item.batch_id) {
                          return (
                            <span
                              className="text-[10px] text-muted-foreground italic"
                              title="Seleccione un lote primero"
                            >
                              Elija lote primero
                            </span>
                          );
                        }
                        const available = batchWarehousesMap[item.batch_id] || [];
                        if (available.length === 0) {
                          return (
                            <span className="text-[10px] text-destructive italic" title="Este lote no tiene stock en ningún almacén">
                              Sin stock
                            </span>
                          );
                        }
                        return (
                          <Select
                            value={item.warehouse_id || "none"}
                            onValueChange={(v) => handleSelectWarehouse(item.id, v === "none" ? null : v)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <div className="flex items-center gap-1 truncate">
                                <Warehouse className="h-3 w-3 shrink-0" />
                                <SelectValue placeholder="Almacén..." />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Sin almacén —</SelectItem>
                              {available.map(w => (
                                <SelectItem key={w.warehouse_id} value={w.warehouse_id} className="text-xs">
                                  {w.warehouse_name} ({w.quantity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </TableCell>
                  )}

                  <TableCell>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10 transition-colors"
                      title="Eliminar línea"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
