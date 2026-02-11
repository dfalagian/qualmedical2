import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, CheckCircle2, Package, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface QuoteItem {
  id: string;
  product_id: string | null;
  batch_id: string | null;
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
  onConfirm: (selections: BatchSelection[]) => void;
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

  // Get unique product IDs from quote items
  const productIds = useMemo(() => {
    return [...new Set(quoteItems.filter(i => i.product_id).map(i => i.product_id as string))];
  }, [quoteItems]);

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
        .gt("current_quantity", 0)
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

  // Initialize selections when dialog opens or items change
  useEffect(() => {
    if (open && quoteItems.length > 0) {
      const initialSelections: BatchSelection[] = quoteItems
        .filter(item => item.product_id)
        .map(item => {
          const productBatches = batchesByProduct[item.product_id!] || [];
          // Auto-select first available batch with enough stock
          const autoSelectedBatch = productBatches.find(b => b.current_quantity >= item.cantidad);
          const fallbackBatch = productBatches[0]; // Or first batch if none has enough
          const selectedBatch = autoSelectedBatch || fallbackBatch;
          
          return {
            itemId: item.id,
            productId: item.product_id!,
            batchId: selectedBatch?.id || null,
            batchNumber: selectedBatch?.batch_number || null,
            expirationDate: selectedBatch?.expiration_date || null,
            availableQuantity: selectedBatch?.current_quantity || 0,
            requestedQuantity: item.cantidad,
          };
        });
      setSelections(initialSelections);
    }
  }, [open, quoteItems, batchesByProduct]);

  // Handle batch selection change
  const handleBatchChange = (itemId: string, batchId: string) => {
    setSelections(prev => prev.map(sel => {
      if (sel.itemId === itemId) {
        const productBatches = batchesByProduct[sel.productId] || [];
        const selectedBatch = productBatches.find(b => b.id === batchId);
        return {
          ...sel,
          batchId: selectedBatch?.id || null,
          batchNumber: selectedBatch?.batch_number || null,
          expirationDate: selectedBatch?.expiration_date || null,
          availableQuantity: selectedBatch?.current_quantity || 0,
        };
      }
      return sel;
    }));
  };

  // Items that require batch selection (only those with product_id)
  const itemsRequiringBatch = quoteItems.filter(i => i.product_id);
  
  // Check if all items that need selection have valid selections
  const allSelected = selections.length === 0 || selections.every(sel => sel.batchId !== null);
  
  // Check for items with insufficient stock (including zero stock)
  const itemsWithInsufficientStock = selections.filter(sel => 
    sel.batchId && sel.availableQuantity < sel.requestedQuantity
  );

  // Check for items without available batches (no stock at all) - only for items WITH product_id
  const itemsWithoutBatches = quoteItems.filter(item => {
    if (!item.product_id) return false; // Skip items not linked to inventory
    const productBatches = batchesByProduct[item.product_id] || [];
    return productBatches.length === 0;
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

  // Can approve if no stock issues exist (items without product_id are allowed)
  const canApprove = allSelected && allProductsWithoutStock.length === 0;

  const handleConfirm = () => {
    if (!canApprove) {
      return;
    }
    onConfirm(selections);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Seleccionar Lotes para Aprobar Venta
          </DialogTitle>
          <DialogDescription>
            Seleccione el lote de cada producto. El stock se verificará en tiempo real.
          </DialogDescription>
        </DialogHeader>

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
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteItems.filter(i => i.product_id).map(item => {
                    const productBatches = batchesByProduct[item.product_id!] || [];
                    const selection = selections.find(s => s.itemId === item.id);
                    const hasEnoughStock = selection && selection.availableQuantity >= item.cantidad;
                    const noBatches = productBatches.length === 0;

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.nombre_producto}</div>
                          <div className="text-xs text-muted-foreground">{item.marca || "-"}</div>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.cantidad}
                        </TableCell>
                        <TableCell>
                          {noBatches ? (
                            <span className="text-sm text-destructive">Sin lotes disponibles</span>
                          ) : (
                            <Select
                              value={selection?.batchId || ""}
                              onValueChange={(value) => handleBatchChange(item.id, value)}
                            >
                              <SelectTrigger className="w-[280px]">
                                <SelectValue placeholder="Seleccionar lote..." />
                              </SelectTrigger>
                              <SelectContent>
                                {productBatches.map(batch => (
                                  <SelectItem key={batch.id} value={batch.id}>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="font-medium">{batch.batch_number}</span>
                                      <span className="text-muted-foreground text-xs">
                                        Cad: {format(new Date(batch.expiration_date), "dd/MM/yyyy")} · 
                                        Stock: {batch.current_quantity}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {selection?.batchId ? (
                            <span className={cn(
                              "font-medium",
                              hasEnoughStock ? "text-emerald-600" : "text-amber-600"
                            )}>
                              {selection.availableQuantity}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {noBatches ? (
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
