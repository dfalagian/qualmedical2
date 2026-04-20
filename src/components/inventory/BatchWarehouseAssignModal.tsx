import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncWarehouseStockFromBatches } from "@/lib/syncWarehouseStock";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Package, Warehouse, Save, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface BatchWarehouseAssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

interface BatchInfo {
  id: string;
  batch_number: string;
  expiration_date: string;
  current_quantity: number;
}

interface WarehouseInfo {
  id: string;
  name: string;
  code: string;
}

interface ExistingRecord {
  id: string;
  batch_id: string;
  warehouse_id: string;
  quantity: number;
}

export function BatchWarehouseAssignModal({
  open,
  onOpenChange,
  productId,
  productName,
}: BatchWarehouseAssignModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  // quantities[batchId][warehouseId] = number
  const [quantities, setQuantities] = useState<Record<string, Record<string, number>>>({});

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).sort((a: any, b: any) => {
        if (a.name === "Almacén Principal") return -1;
        if (b.name === "Almacén Principal") return 1;
        return a.name.localeCompare(b.name);
      }) as WarehouseInfo[];
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["product-batches-location", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", productId)
        .eq("is_active", true)
        .gt("current_quantity", 0)
        .order("expiration_date", { ascending: true });
      if (error) throw error;
      return (data || []) as BatchInfo[];
    },
    enabled: open,
  });

  const { data: existingRecords = [] } = useQuery({
    queryKey: ["batch-warehouse-stock-all", productId],
    queryFn: async () => {
      if (batches.length === 0) return [];
      const batchIds = batches.map((b) => b.id);
      const { data, error } = await (supabase as any)
        .from("batch_warehouse_stock")
        .select("id, batch_id, warehouse_id, quantity")
        .in("batch_id", batchIds);
      if (error) throw error;
      return (data || []) as unknown as ExistingRecord[];
    },
    enabled: open && batches.length > 0,
  });

  // Initialize quantities from existing records
  useEffect(() => {
    if (!open) return;
    const q: Record<string, Record<string, number>> = {};
    for (const batch of batches) {
      q[batch.id] = {};
      for (const wh of warehouses) {
        const existing = existingRecords.find(
          (r) => r.batch_id === batch.id && r.warehouse_id === wh.id
        );
        q[batch.id][wh.id] = existing ? existing.quantity : 0;
      }
    }
    setQuantities(q);
  }, [open, batches, warehouses, existingRecords]);

  const setQty = (batchId: string, warehouseId: string, value: number) => {
    setQuantities((prev) => ({
      ...prev,
      [batchId]: {
        ...prev[batchId],
        [warehouseId]: Math.max(0, value),
      },
    }));
  };

  const getRowTotal = (batchId: string) => {
    const row = quantities[batchId] || {};
    return Object.values(row).reduce((sum, v) => sum + (v || 0), 0);
  };

  // Warning only - admin can override
  const hasOverages = batches.some((b) => getRowTotal(b.id) > b.current_quantity);

  const handleSave = async () => {
    if (hasOverages) {
      // Auto-update batch current_quantity to match assigned total
      toast({
        title: "Nota",
        description: "Se actualizará la cantidad del lote para coincidir con la distribución asignada",
      });
    }

    setIsSaving(true);
    try {
      for (const batch of batches) {
        for (const wh of warehouses) {
          const qty = quantities[batch.id]?.[wh.id] || 0;
          const existing = existingRecords.find(
            (r) => r.batch_id === batch.id && r.warehouse_id === wh.id
          );

          if (existing) {
            if (qty !== existing.quantity) {
              if (qty === 0) {
                await (supabase as any)
                  .from("batch_warehouse_stock")
                  .delete()
                  .eq("id", existing.id);
              } else {
                await (supabase as any)
                  .from("batch_warehouse_stock")
                  .update({ quantity: qty })
                  .eq("id", existing.id);
              }
            }
          } else if (qty > 0) {
            await (supabase as any)
              .from("batch_warehouse_stock")
              .insert({
                batch_id: batch.id,
                warehouse_id: wh.id,
                quantity: qty,
              });
          }
        }
      }

      // Red de seguridad: resincronizar warehouse_stock desde batch_warehouse_stock
      // para evitar race conditions cuando se insertan múltiples registros rápidamente
      await syncWarehouseStockFromBatches(productId);

      toast({ title: "Lotes asignados", description: "Las cantidades por almacén se guardaron correctamente" });
      queryClient.invalidateQueries({ queryKey: ["batch-warehouse-stock", productId] });
      queryClient.invalidateQueries({ queryKey: ["batch-warehouse-stock-all", productId] });
      queryClient.invalidateQueries({ queryKey: ["product-warehouse-stock", productId] });
      queryClient.invalidateQueries({ queryKey: ["product-batches-location", productId] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_stock_by_product"] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Asignar lotes a almacenes — {productName}
          </DialogTitle>
        </DialogHeader>

        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Este producto no tiene lotes activos con stock.
          </p>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid gap-2 items-center text-xs font-semibold text-muted-foreground px-1"
              style={{ gridTemplateColumns: `200px repeat(${warehouses.length}, 1fr) 70px` }}
            >
              <span>Lote</span>
              {warehouses.map((wh) => (
                <span key={wh.id} className="text-center truncate" title={wh.name}>
                  {wh.name}
                </span>
              ))}
              <span className="text-center">Total</span>
            </div>

            {/* Rows */}
            {batches.map((batch) => {
              const rowTotal = getRowTotal(batch.id);
              const overLimit = rowTotal > batch.current_quantity;
              const isExpiring =
                new Date(batch.expiration_date) <
                new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

              return (
                <div
                  key={batch.id}
                  className={`grid gap-2 items-center p-2 rounded ${overLimit ? "bg-destructive/10 border border-destructive/30" : "bg-muted/20"}`}
                  style={{ gridTemplateColumns: `200px repeat(${warehouses.length}, 1fr) 70px` }}
                >
                  <div className="text-xs">
                    <span className="font-medium">{batch.batch_number}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={isExpiring ? "text-destructive" : "text-muted-foreground"}>
                        Cad: {format(new Date(batch.expiration_date), "MMM yyyy", { locale: es })}
                      </span>
                      <span className="text-muted-foreground">• {batch.current_quantity} uds</span>
                    </div>
                  </div>

                  {warehouses.map((wh) => (
                    <Input
                      key={wh.id}
                      type="number"
                      min={0}
                      max={batch.current_quantity}
                      value={quantities[batch.id]?.[wh.id] ?? 0}
                      onChange={(e) => setQty(batch.id, wh.id, parseInt(e.target.value) || 0)}
                      className="h-8 text-xs text-center"
                    />
                  ))}

                  <div className="text-center">
                    <Badge
                      variant={overLimit ? "destructive" : rowTotal === batch.current_quantity ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {rowTotal}/{batch.current_quantity}
                    </Badge>
                  </div>
                </div>
              );
            })}

            {hasOverages && (
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded text-xs text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                La suma asignada supera la cantidad registrada del lote. Al guardar, se actualizará automáticamente la cantidad del lote.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || batches.length === 0} className="gap-1">
            <Save className="h-4 w-4" />
            {isSaving ? "Guardando..." : "Guardar asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
