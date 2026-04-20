import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Package, AlertCircle, Warehouse } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface QuoteItem {
  id: string;
  product_id: string | null;
  batch_id: string | null;
  warehouse_id?: string | null;
  nombre_producto: string;
  marca: string | null;
  lote: string | null;
  fecha_caducidad: string | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
}

interface Batch {
  id: string;
  batch_number: string;
  expiration_date: string;
  current_quantity: number;
}

interface BatchSelection {
  itemId: string;
  productId: string;
  batchId: string | null;
  batchNumber: string | null;
  expirationDate: string | null;
  availableQuantity: number;
  requestedQuantity: number;
}

interface BatchSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  quoteItems: QuoteItem[];
  onConfirm: (selections: BatchSelection[], warehouseId: string) => void;
  isApproving: boolean;
}

export const BatchSelectionDialog = ({
  open,
  onOpenChange,
  quoteId,
  quoteItems,
  onConfirm,
  isApproving,
}: BatchSelectionDialogProps) => {
  const [selections, setSelections] = useState<BatchSelection[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  // Track which items the user explicitly wants to edit (override the auto-FEFO selection)
  const [editingBatchItemIds, setEditingBatchItemIds] = useState<Set<string>>(new Set());

  // Get unique product IDs from quote items
  const productIds = useMemo(() => {
    return [...new Set(quoteItems.filter(i => i.product_id).map(i => i.product_id as string))];
  }, [quoteItems]);

  // Fetch active warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-for-sale"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Auto-select warehouse when list loads:
  // - Prefer the most-frequent warehouse_id suggested by the quote items
  // - Otherwise fall back to the first active warehouse
  useEffect(() => {
    if (warehouses.length === 0 || selectedWarehouseId) return;
    const counts = new Map<string, number>();
    for (const it of quoteItems) {
      if (it.warehouse_id && warehouses.some(w => w.id === it.warehouse_id)) {
        counts.set(it.warehouse_id, (counts.get(it.warehouse_id) || 0) + 1);
      }
    }
    let suggested: string | null = null;
    let max = 0;
    counts.forEach((count, id) => {
      if (count > max) { max = count; suggested = id; }
    });
    setSelectedWarehouseId(suggested || warehouses[0].id);
  }, [warehouses, quoteItems, selectedWarehouseId]);

  // Reset warehouse + edit state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedWarehouseId("");
      setEditingBatchItemIds(new Set());
    }
  }, [open]);

  // Fetch warehouse stock for selected warehouse
  const { data: warehouseStockMap = {} } = useQuery({
    queryKey: ["warehouse-stock-for-sale", selectedWarehouseId, productIds],
    queryFn: async () => {
      if (!selectedWarehouseId || productIds.length === 0) return {};
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("product_id, current_stock")
        .eq("warehouse_id", selectedWarehouseId)
        .in("product_id", productIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach(ws => { map[ws.product_id] = ws.current_stock; });
      return map;
    },
    enabled: open && !!selectedWarehouseId && productIds.length > 0,
  });

  // Fetch batches for all products in the quote
  const { data: batchesByProduct = {}, isLoading } = useQuery({
    queryKey: ["product-batches-approval", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, product_id, batch_number, expiration_date, current_quantity")
        .in("product_id", productIds)
        .eq("is_active", true)
        .order("expiration_date", { ascending: true });
      
      if (error) throw error;
      
      // Group batches by product_id
      const grouped: Record<string, Batch[]> = {};
      for (const batch of data) {
        if (!grouped[batch.product_id]) {
          grouped[batch.product_id] = [];
        }
        grouped[batch.product_id].push(batch);
      }
      return grouped;
    },
    enabled: open && productIds.length > 0,
  });

  // Collect all batch ids across products to query per-warehouse stock
  const allBatchIds = useMemo(() => {
    const ids: string[] = [];
    for (const list of Object.values(batchesByProduct) as Batch[][]) {
      for (const b of list) ids.push(b.id);
    }
    return ids;
  }, [batchesByProduct]);

  // Fetch per-warehouse stock for these batches in the SELECTED warehouse only
  const { data: batchWarehouseQtyMap = {} } = useQuery({
    queryKey: ["batch-warehouse-stock-approval", selectedWarehouseId, allBatchIds],
    queryFn: async () => {
      if (!selectedWarehouseId || allBatchIds.length === 0) return {};
      const { data, error } = await (supabase as any)
        .from("batch_warehouse_stock")
        .select("batch_id, quantity")
        .eq("warehouse_id", selectedWarehouseId)
        .in("batch_id", allBatchIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => { map[r.batch_id] = r.quantity; });
      return map;
    },
    enabled: open && !!selectedWarehouseId && allBatchIds.length > 0,
  });

  // Return only the batches that have stock IN THE SELECTED WAREHOUSE.
  // batch_warehouse_stock is the SSOT — if a batch has 0 stock in this warehouse, it must NOT appear.
  const getFilteredBatches = (productId: string): (Batch & { warehouseQty: number })[] => {
    const allBatches = batchesByProduct[productId] || [];
    if (!selectedWarehouseId) return [];
    return allBatches
      .map(b => ({ ...b, warehouseQty: batchWarehouseQtyMap[b.id] ?? 0 }))
      .filter(b => b.warehouseQty > 0);
  };

  // Initialize selections when dialog opens or items change
  // IMPORTANT: If the user already selected a batch during quote creation, respect that choice
  useEffect(() => {
    if (open && quoteItems.length > 0) {
      const initialSelections: BatchSelection[] = quoteItems
        .filter(item => item.product_id)
        .map(item => {
          const filteredBatches = getFilteredBatches(item.product_id!);
          
          // Priority 1: match by batch_id (UUID) if available
          let userSelectedBatch = item.batch_id 
            ? filteredBatches.find(b => b.id === item.batch_id) 
            : null;
          
          // Priority 2: if no batch_id but lote (batch number) exists, match by name
          if (!userSelectedBatch && item.lote) {
            userSelectedBatch = filteredBatches.find(b => b.batch_number === item.lote) || null;
          }
          
          // Priority 3: auto-select only if user didn't choose any batch - use warehouse qty
          let selectedBatch = userSelectedBatch;
          if (!selectedBatch) {
            const autoSelectedBatch = filteredBatches.find(b => b.warehouseQty >= item.cantidad);
            selectedBatch = autoSelectedBatch || filteredBatches[0] || null;
          }
          
          return {
            itemId: item.id,
            productId: item.product_id!,
            batchId: selectedBatch?.id || null,
            batchNumber: selectedBatch?.batch_number || null,
            expirationDate: selectedBatch?.expiration_date || null,
            availableQuantity: selectedBatch?.warehouseQty ?? selectedBatch?.current_quantity ?? 0,
            requestedQuantity: item.cantidad,
          };
        });
      setSelections(initialSelections);
    }
  }, [open, quoteItems, batchesByProduct, selectedWarehouseId]);

  // Handle batch selection change
  const handleBatchChange = (itemId: string, batchId: string) => {
    setSelections(prev => prev.map(sel => {
      if (sel.itemId === itemId) {
        const filteredBatches = getFilteredBatches(sel.productId);
        const selectedBatch = filteredBatches.find(b => b.id === batchId);
        return {
          ...sel,
          batchId: selectedBatch?.id || null,
          batchNumber: selectedBatch?.batch_number || null,
          expirationDate: selectedBatch?.expiration_date || null,
          availableQuantity: selectedBatch?.warehouseQty ?? selectedBatch?.current_quantity ?? 0,
        };
      }
      return sel;
    }));
  };

  // Check if all items that need selection have valid selections
  const allSelected = selections.length === 0 || selections.every(sel => sel.batchId !== null);
  
  // Check for items with insufficient stock in the selected warehouse
  const itemsWithInsufficientWarehouseStock = quoteItems.filter(item => {
    if (!item.product_id) return false;
    const warehouseStock = warehouseStockMap[item.product_id] ?? 0;
    return warehouseStock < item.cantidad;
  });

  // Check for items with insufficient stock in batch (including zero stock)
  const itemsWithInsufficientStock = selections.filter(sel => 
    sel.batchId && sel.availableQuantity < sel.requestedQuantity
  );

  // Check for items without available batches in the selected warehouse
  const itemsWithoutBatches = quoteItems.filter(item => {
    if (!item.product_id) return false;
    const filteredBatches = getFilteredBatches(item.product_id);
    return filteredBatches.length === 0;
  });

  // Combine all products without sufficient stock for the error message
  const allProductsWithoutStock = [
    ...itemsWithoutBatches.map(item => ({
      name: item.nombre_producto,
      requested: item.cantidad,
      available: 0,
    })),
    ...itemsWithInsufficientStock.map(sel => {
      const item = quoteItems.find(i => i.id === sel.itemId);
      return {
        name: item?.nombre_producto || "Producto desconocido",
        requested: sel.requestedQuantity,
        available: sel.availableQuantity,
      };
    }),
  ];

  // Can approve if no stock issues exist and warehouse is selected
  const canApprove = allSelected && allProductsWithoutStock.length === 0 && !!selectedWarehouseId;

  const handleConfirm = () => {
    if (!canApprove || !selectedWarehouseId) return;
    onConfirm(selections, selectedWarehouseId);
  };

  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Seleccionar Lotes para Aprobar Venta
          </DialogTitle>
          <DialogDescription>
            Seleccione el almacén de origen y el lote de cada producto.
          </DialogDescription>
        </DialogHeader>

        {/* Warehouse Selector */}
        <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
          <Label className="flex items-center gap-2 font-semibold text-base">
            <Warehouse className="h-4 w-4" />
            Almacén de origen de la venta
          </Label>
          <p className="text-sm text-muted-foreground">
            El stock se descontará de este almacén al aprobar.
          </p>
          <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="Seleccionar almacén..." />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map(wh => (
                <SelectItem key={wh.id} value={wh.id}>
                  <div className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4" />
                    {wh.name}
                    {wh.code && <span className="text-muted-foreground text-xs">({wh.code})</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stock availability in selected warehouse */}
          {selectedWarehouseId && itemsWithInsufficientWarehouseStock.length > 0 && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              <p className="font-medium flex items-center gap-1 mb-1">
                <AlertTriangle className="h-4 w-4" />
                Stock insuficiente en {selectedWarehouse?.name}:
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {itemsWithInsufficientWarehouseStock.map(item => (
                  <li key={item.id}>
                    {item.nombre_producto}: disponible {warehouseStockMap[item.product_id!] ?? 0}, solicitado {item.cantidad}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Cargando lotes disponibles...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Error: Products without sufficient stock - BLOCKS approval */}
            {allProductsWithoutStock.length > 0 && (
              <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm text-destructive">
                  <p className="font-semibold text-base mb-2">
                    No se puede aprobar la venta - Stock insuficiente
                  </p>
                  <p className="mb-2">Los siguientes medicamentos no tienen stock disponible suficiente:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {allProductsWithoutStock.map((product, index) => (
                      <li key={index} className="font-medium">
                        {product.name}: 
                        <span className="ml-1">
                          Disponible <strong>{product.available}</strong>, 
                          Solicitado <strong>{product.requested}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-destructive/80 italic">
                    Por favor, ajuste las cantidades en la cotización o ingrese stock antes de aprobar.
                  </p>
                </div>
              </div>
            )}

            {/* Batch selection table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead>Seleccionar Lote</TableHead>
                    <TableHead className="text-center">Stock Lote</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteItems.map(item => {
                    const hasProductId = !!item.product_id;
                    const filteredBatches = hasProductId ? getFilteredBatches(item.product_id!) : [];
                    const selection = selections.find(s => s.itemId === item.id);
                    const hasEnoughStock = selection && selection.availableQuantity >= item.cantidad;
                    const noBatches = hasProductId && filteredBatches.length === 0;
                    const warehouseStock = hasProductId ? (warehouseStockMap[item.product_id!] ?? null) : null;

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.nombre_producto}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.marca || "-"}
                            {warehouseStock !== null && (
                              <span className={cn(
                                "ml-2 font-medium",
                                warehouseStock >= item.cantidad ? "text-emerald-600" : "text-amber-600"
                              )}>
                                · Almacén: {warehouseStock}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.cantidad}
                        </TableCell>
                        <TableCell>
                          {!hasProductId ? (
                            <span className="text-sm text-muted-foreground italic">Sin control de inventario</span>
                          ) : noBatches ? (
                            <span className="text-sm text-destructive">
                              {selectedWarehouseId 
                                ? "Sin lotes en este almacén" 
                                : "Sin lotes disponibles"}
                            </span>
                          ) : (() => {
                            const isEditing = editingBatchItemIds.has(item.id);
                            const onlyOneBatch = filteredBatches.length === 1;
                            const hasAutoSelection = !!selection?.batchId && !!selection.batchNumber;
                            // Show compact view if user is not editing AND we have an auto-selection (or only 1 lote)
                            const showCompact = !isEditing && hasAutoSelection;

                            if (showCompact) {
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <Package className="h-3.5 w-3.5 text-emerald-600" />
                                      <span className="font-medium text-sm">{selection.batchNumber}</span>
                                      {!onlyOneBatch && (
                                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-300 text-emerald-700 bg-emerald-50">
                                          Auto FEFO
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">
                                      Cad: {selection.expirationDate ? format(new Date(selection.expirationDate), "dd/MM/yyyy") : "—"}
                                    </span>
                                  </div>
                                  {!onlyOneBatch && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingBatchItemIds(prev => new Set(prev).add(item.id))}
                                      className="text-xs text-primary hover:underline ml-auto"
                                    >
                                      Cambiar
                                    </button>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <Select
                                value={selection?.batchId || ""}
                                onValueChange={(value) => {
                                  handleBatchChange(item.id, value);
                                  // Keep editing mode after change so user sees the dropdown they just used
                                }}
                              >
                                <SelectTrigger className="w-[300px]">
                                  <SelectValue placeholder="Seleccionar lote..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {filteredBatches.map(batch => (
                                    <SelectItem key={batch.id} value={batch.id}>
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="font-medium">{batch.batch_number}</span>
                                        <span className="text-muted-foreground text-xs">
                                          Cad: {format(new Date(batch.expiration_date), "dd/MM/yyyy")} · 
                                          Disp: {batch.warehouseQty}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          {!hasProductId ? (
                            <span className="text-muted-foreground">-</span>
                          ) : selection?.batchId ? (
                            <span className={cn(
                              "font-medium",
                              hasEnoughStock ? "text-emerald-600" : "text-amber-600"
                            )}>
                              {selection.availableQuantity}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {!hasProductId ? (
                            <Badge variant="secondary">N/A</Badge>
                          ) : noBatches ? (
                            <Badge variant="destructive">Sin stock</Badge>
                          ) : !selection?.batchId ? (
                            <Badge variant="outline">Pendiente</Badge>
                          ) : hasEnoughStock ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500 hover:bg-amber-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Bajo
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApproving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canApprove || isApproving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted"
          >
            {isApproving ? "Aprobando..." : "Confirmar y Aprobar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
