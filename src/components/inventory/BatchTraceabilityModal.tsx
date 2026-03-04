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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileSearch, 
  ArrowUpCircle, 
  ArrowDownCircle,
  Package,
  Tag,
  MapPin,
  User,
  History,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export function BatchTraceabilityModal() {
  const [open, setOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [searchEpc, setSearchEpc] = useState("");
  const [page, setPage] = useState(0);
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [batchPopoverOpen, setBatchPopoverOpen] = useState(false);

  // Fetch products for filter
  const { data: products = [] } = useQuery({
    queryKey: ["products_for_traceability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch batches, optionally filtered by product
  const { data: batches = [] } = useQuery({
    queryKey: ["batches_for_traceability", selectedProduct],
    queryFn: async () => {
      let query = supabase
        .from("product_batches")
        .select(`id, batch_number, product_id, products:product_id (name, sku)`)
        .order("batch_number", { ascending: false });
      if (selectedProduct) query = query.eq("product_id", selectedProduct);
      const { data, error } = await query;
      if (error) throw error;
      return data as { id: string; batch_number: string; product_id: string; products: { name: string; sku: string } | null }[];
    },
    enabled: open,
  });

  // Helper: resolve batch to product_id
  const batchProductId = selectedBatch
    ? batches.find((b) => b.id === selectedBatch)?.product_id
    : undefined;

  // Count total movements for pagination
  const { data: totalCount = 0 } = useQuery({
    queryKey: ["inventory_movements_count", selectedBatch, selectedProduct, searchEpc, batchProductId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_movements")
        .select("id", { count: "exact", head: true });

      // When batch is selected, filter by its product_id (movements are product-level)
      if (selectedBatch && batchProductId) {
        query = query.eq("product_id", batchProductId);
      } else if (selectedProduct) {
        query = query.eq("product_id", selectedProduct);
      }

      if (searchEpc) {
        const { data: tagData } = await supabase
          .from("rfid_tags")
          .select("id")
          .ilike("epc", `%${searchEpc}%`);
        if (tagData && tagData.length > 0) {
          query = query.in("rfid_tag_id", tagData.map((t) => t.id));
        } else {
          return 0;
        }
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: open,
  });

  // Fetch movements with server-side pagination and filters
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["inventory_movements_trace", selectedBatch, selectedProduct, searchEpc, page, batchProductId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_movements")
        .select(`
          *,
          products:product_id (name, sku),
          rfid_tags:rfid_tag_id (epc, batch_id, product_batches:batch_id (batch_number)),
          profiles:created_by (full_name)
        `)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      // When batch is selected, filter by its product_id (movements are product-level)
      if (selectedBatch && batchProductId) {
        query = query.eq("product_id", batchProductId);
      } else if (selectedProduct) {
        query = query.eq("product_id", selectedProduct);
      }

      if (searchEpc) {
        const { data: tagData } = await supabase
          .from("rfid_tags")
          .select("id")
          .ilike("epc", `%${searchEpc}%`);
        if (tagData && tagData.length > 0) {
          query = query.in("rfid_tag_id", tagData.map((t) => t.id));
        } else {
          return [];
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: open,
  });

  // Fetch transfers with pagination
  const { data: transfersCount = 0 } = useQuery({
    queryKey: ["transfers_count_trace", selectedProduct, selectedBatch],
    queryFn: async () => {
      let query = supabase
        .from("warehouse_transfers")
        .select("id", { count: "exact", head: true })
        .eq("status", "completada");
      if (selectedProduct) query = query.eq("product_id", selectedProduct);
      if (selectedBatch) query = query.eq("batch_id", selectedBatch);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: open,
  });

  const [transferPage, setTransferPage] = useState(0);

  const { data: transfers = [], isLoading: transfersLoading } = useQuery({
    queryKey: ["transfers_trace", selectedProduct, selectedBatch, transferPage],
    queryFn: async () => {
      let query = supabase
        .from("warehouse_transfers")
        .select(`
          *,
          products:product_id (name, sku),
          product_batches:batch_id (batch_number),
          from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey (name),
          to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey (name),
          profiles:created_by (full_name)
        `)
        .eq("status", "completada")
        .order("confirmed_at", { ascending: false })
        .range(transferPage * PAGE_SIZE, (transferPage + 1) * PAGE_SIZE - 1);

      if (selectedProduct) query = query.eq("product_id", selectedProduct);
      if (selectedBatch) query = query.eq("batch_id", selectedBatch);

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: open,
  });

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "entrada": return <ArrowDownCircle className="h-4 w-4 text-green-500" />;
      case "salida": return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
      default: return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type) {
      case "entrada": return <Badge className="bg-green-100 text-green-700">Entrada</Badge>;
      case "salida": return <Badge className="bg-red-100 text-red-700">Salida</Badge>;
      case "ajuste": return <Badge variant="secondary">Ajuste</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  // Stats from current page (approximate for display)
  const entradas = movements.filter((m: any) => m.movement_type === "entrada").length;
  const salidas = movements.filter((m: any) => m.movement_type === "salida").length;

  const clearFilters = () => {
    setSelectedBatch("");
    setSelectedProduct("");
    setSearchEpc("");
    setPage(0);
    setTransferPage(0);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const totalTransferPages = Math.ceil(transfersCount / PAGE_SIZE);

  const selectedProductName = products.find((p) => p.id === selectedProduct);
  const selectedBatchName = batches.find((b) => b.id === selectedBatch);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSearch className="h-4 w-4" />
          Trazabilidad
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Control de Trazabilidad de Movimientos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Product Combobox */}
                <div className="space-y-2">
                  <Label className="text-xs">Producto</Label>
                  <Popover modal={true} open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {selectedProductName
                          ? <span className="truncate">{selectedProductName.sku} - {selectedProductName.name}</span>
                          : "Todos los productos"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 z-[9999]">
                      <Command>
                        <CommandInput placeholder="Buscar por nombre o SKU..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setSelectedProduct("");
                                setSelectedBatch("");
                                setPage(0);
                                setTransferPage(0);
                                setProductPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !selectedProduct ? "opacity-100" : "opacity-0")} />
                              Todos los productos
                            </CommandItem>
                            {products.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.sku} ${p.name}`}
                                onSelect={() => {
                                  setSelectedProduct(p.id);
                                  setSelectedBatch("");
                                  setPage(0);
                                  setTransferPage(0);
                                  setProductPopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedProduct === p.id ? "opacity-100" : "opacity-0")} />
                                {p.sku} - {p.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Batch Combobox */}
                <div className="space-y-2">
                  <Label className="text-xs">Lote</Label>
                  <Popover modal={true} open={batchPopoverOpen} onOpenChange={setBatchPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {selectedBatchName
                          ? <span className="truncate">{selectedBatchName.batch_number}</span>
                          : "Todos los lotes"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 z-[9999]">
                      <Command>
                        <CommandInput placeholder="Buscar lote..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setSelectedBatch("");
                                setPage(0);
                                setTransferPage(0);
                                setBatchPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !selectedBatch ? "opacity-100" : "opacity-0")} />
                              Todos los lotes
                            </CommandItem>
                            {batches.map((b) => (
                              <CommandItem
                                key={b.id}
                                value={`${b.batch_number} ${b.products?.name || ""}`}
                                onSelect={() => {
                                  setSelectedBatch(b.id);
                                  setPage(0);
                                  setTransferPage(0);
                                  setBatchPopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedBatch === b.id ? "opacity-100" : "opacity-0")} />
                                {b.batch_number} - {b.products?.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Buscar por EPC</Label>
                  <Input
                    placeholder="EPC del tag..."
                    value={searchEpc}
                    onChange={(e) => { setSearchEpc(e.target.value); setPage(0); }}
                  />
                </div>

                <div className="flex items-end">
                  <Button variant="ghost" onClick={clearFilters} className="w-full">
                    Limpiar filtros
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info when filtering by batch */}
          {selectedBatch && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
              ⚠ Los movimientos de inventario se registran a nivel de producto, no de lote. Al filtrar por lote se muestran todos los movimientos del producto asociado. Las transferencias sí se filtran por lote específico.
            </p>
          )}

          {/* Tabs: Movimientos + Transferencias */}
          <Tabs defaultValue="movements">
            <TabsList>
              <TabsTrigger value="movements" className="gap-1">
                <History className="h-4 w-4" />
                Movimientos ({totalCount})
              </TabsTrigger>
              <TabsTrigger value="transfers" className="gap-1">
                <ArrowLeftRight className="h-4 w-4" />
                Transferencias ({transfersCount})
              </TabsTrigger>
            </TabsList>

            {/* Movements Tab */}
            <TabsContent value="movements" className="space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="text-xl font-bold text-green-600">{entradas}</p>
                        <p className="text-xs text-muted-foreground">Entradas (pág.)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <ArrowUpCircle className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="text-xl font-bold text-red-600">{salidas}</p>
                        <p className="text-xs text-muted-foreground">Salidas (pág.)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xl font-bold">{totalCount}</p>
                        <p className="text-xs text-muted-foreground">Total movimientos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <ScrollArea className="h-[350px]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2">Cargando movimientos...</span>
                  </div>
                ) : movements.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No hay movimientos registrados con los filtros seleccionados
                    </CardContent>
                  </Card>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Tipo</TableHead>
                        <TableHead>Fecha/Hora</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Lote</TableHead>
                        <TableHead>Tag EPC</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-center">Stock</TableHead>
                        <TableHead>Ubicación</TableHead>
                        <TableHead>Usuario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((mov: any) => (
                        <TableRow key={mov.id}>
                          <TableCell>{getMovementIcon(mov.movement_type)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {format(parseISO(mov.created_at), "dd MMM yyyy", { locale: es })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(mov.created_at), "HH:mm:ss")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{mov.products?.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{mov.products?.sku}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {mov.rfid_tags?.product_batches?.batch_number ? (
                              <Badge variant="outline" className="font-mono text-xs">
                                {mov.rfid_tags.product_batches.batch_number}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {mov.rfid_tags ? (
                              <div className="flex items-center gap-1">
                                <Tag className="h-3 w-3 text-muted-foreground" />
                                <span className="font-mono text-xs">{mov.rfid_tags.epc.slice(-8)}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {getMovementBadge(mov.movement_type)}
                            <span className="ml-1 font-mono text-sm">
                              {mov.movement_type === "entrada" ? "+" : "-"}{mov.quantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-muted-foreground">{mov.previous_stock ?? "-"}</span>
                            <span className="mx-1">→</span>
                            <span className="font-medium">{mov.new_stock ?? "-"}</span>
                          </TableCell>
                          <TableCell>
                            {mov.location ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">{mov.location}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {mov.profiles ? (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">{mov.profiles.full_name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">Sistema</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Página {page + 1} de {totalPages} ({totalCount} registros)
                  </p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" disabled={page === 0} onClick={() => setPage(0)}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Transfers Tab */}
            <TabsContent value="transfers" className="space-y-3">
              <ScrollArea className="h-[400px]">
                {transfersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2">Cargando transferencias...</span>
                  </div>
                ) : transfers.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No hay transferencias completadas con los filtros seleccionados
                    </CardContent>
                  </Card>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Lote</TableHead>
                        <TableHead>Origen</TableHead>
                        <TableHead>Destino</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead>Usuario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {t.confirmed_at ? format(parseISO(t.confirmed_at), "dd MMM yyyy", { locale: es }) : "-"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t.confirmed_at ? format(parseISO(t.confirmed_at), "HH:mm:ss") : ""}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{t.products?.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{t.products?.sku}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {t.product_batches?.batch_number ? (
                              <Badge variant="outline" className="font-mono text-xs">
                                {t.product_batches.batch_number}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-red-400" />
                              <span className="text-xs">{t.from_warehouse?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-green-400" />
                              <span className="text-xs">{t.to_warehouse?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-mono font-medium">{t.quantity}</span>
                          </TableCell>
                          <TableCell>
                            {t.profiles ? (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">{t.profiles.full_name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>

              {/* Transfer Pagination */}
              {totalTransferPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Página {transferPage + 1} de {totalTransferPages} ({transfersCount} registros)
                  </p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" disabled={transferPage === 0} onClick={() => setTransferPage(0)}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={transferPage === 0} onClick={() => setTransferPage(transferPage - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={transferPage >= totalTransferPages - 1} onClick={() => setTransferPage(transferPage + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={transferPage >= totalTransferPages - 1} onClick={() => setTransferPage(totalTransferPages - 1)}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
