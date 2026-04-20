import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncWarehouseStockFromBatches } from "@/lib/syncWarehouseStock";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLogger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, ArrowRightLeft, Plus, AlertTriangle, Package, MapPin, ChevronDown, ChevronRight, Save, Layers, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BatchWarehouseAssignModal } from "./BatchWarehouseAssignModal";

interface ProductWarehouseManagerProps {
  productId: string;
  productName: string;
  currentStock: number;
  warehouseId?: string | null;
}

interface WarehouseStockRow {
  id: string;
  warehouse_id: string;
  current_stock: number;
  warehouse_name: string;
  warehouse_code: string;
}

interface BatchInfo {
  id: string;
  batch_number: string;
  expiration_date: string;
  current_quantity: number;
}

interface BatchWarehouseRow {
  id: string;
  batch_id: string;
  warehouse_id: string;
  quantity: number;
}

export function ProductWarehouseManager({
  productId,
  productName,
  currentStock,
  warehouseId,
}: ProductWarehouseManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [expandedWarehouse, setExpandedWarehouse] = useState<string | null>(null);
  const [showBatchAssignModal, setShowBatchAssignModal] = useState(false);
  const [moveData, setMoveData] = useState({
    fromWarehouse: "",
    toWarehouse: "",
    quantity: 1,
  });
  const [assignWarehouse, setAssignWarehouse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch warehouses
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
      });
    },
  });

  // Fetch warehouse stock for this product
  const { data: warehouseStock = [], isLoading: loadingStock } = useQuery({
    queryKey: ["product-warehouse-stock", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, warehouse_id, current_stock")
        .eq("product_id", productId);
      if (error) throw error;

      const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w]));
      return (data || []).map((ws: any) => {
        const w = warehouseMap.get(ws.warehouse_id);
        return {
          ...ws,
          warehouse_name: w?.name || "Desconocido",
          warehouse_code: w?.code || "",
        } as WarehouseStockRow;
      }).filter((ws: WarehouseStockRow) => ws.current_stock !== 0);
    },
    enabled: warehouses.length > 0,
  });

  // Fetch active batches for this product
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
  });

  // Fetch batch_warehouse_stock - the explicit user-assigned mapping
  const { data: batchWarehouseStock = [] } = useQuery({
    queryKey: ["batch-warehouse-stock", productId],
    queryFn: async () => {
      if (batches.length === 0) return [];
      const batchIds = batches.map((b) => b.id);
      const { data, error } = await (supabase as any)
        .from("batch_warehouse_stock")
        .select("id, batch_id, warehouse_id, quantity")
        .in("batch_id", batchIds);
      if (error) throw error;
      return (data || []) as unknown as BatchWarehouseRow[];
    },
    enabled: batches.length > 0,
  });

  // Group batch_warehouse_stock by warehouse_id
  const batchesByWarehouse = useMemo(() => {
    const map: Record<string, { batch: BatchInfo; quantity: number }[]> = {};
    for (const bws of batchWarehouseStock) {
      const batch = batches.find((b) => b.id === bws.batch_id);
      if (!batch || bws.quantity <= 0) continue;
      if (!map[bws.warehouse_id]) map[bws.warehouse_id] = [];
      map[bws.warehouse_id].push({ batch, quantity: bws.quantity });
    }
    return map;
  }, [batchWarehouseStock, batches]);

  // Find batches NOT assigned to any warehouse
  const unassignedBatches = useMemo(() => {
    const assignedBatchIds = new Set(batchWarehouseStock.filter(bws => bws.quantity > 0).map(bws => bws.batch_id));
    return batches.filter((b) => !assignedBatchIds.has(b.id));
  }, [batches, batchWarehouseStock]);

  const hasNoWarehouse = warehouseStock.length === 0 && currentStock > 0;
  const totalDistributed = warehouseStock.reduce((sum: number, ws: WarehouseStockRow) => sum + ws.current_stock, 0);
  const unassignedStock = currentStock - totalDistributed;

  // Calculate total batch quantity to detect true orphan stock
  const totalBatchQuantity = batches.reduce((sum, b) => sum + b.current_quantity, 0);
  const orphanStock = currentStock - totalBatchQuantity; // stock not backed by any batch

  // Eliminate excess stock (orphan units not in any batch or warehouse)
  const handleEliminateExcess = useCallback(async () => {
    setIsProcessing(true);
    try {
      // Recalculate product stock from sum of all active batch quantities (the true source of truth)
      const newStock = totalBatchQuantity;
      const { error } = await supabase
        .from("products")
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (error) throw error;

      // Also clean up any warehouse_stock entries that don't have batch backing
      // by recalculating from batch_warehouse_stock
      for (const ws of warehouseStock) {
        const bwsTotal = batchWarehouseStock
          .filter((bws: BatchWarehouseRow) => bws.warehouse_id === ws.warehouse_id && bws.quantity > 0)
          .reduce((sum: number, bws: BatchWarehouseRow) => sum + bws.quantity, 0);
        
        if (bwsTotal !== ws.current_stock) {
          await supabase
            .from("warehouse_stock")
            .update({ current_stock: bwsTotal })
            .eq("id", ws.id);
        }
      }

      await logActivity({
        action: "eliminar",
        section: "inventario",
        entityType: "Producto",
        entityName: productName,
        details: { 
          stock_anterior: currentStock, 
          stock_nuevo: newStock, 
          unidades_eliminadas: currentStock - newStock,
        },
      });

      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-warehouse-stock", productId] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_stock_by_product"] });
      toast({ 
        title: "Excedente eliminado", 
        description: `Se ajustó el stock de ${currentStock} a ${newStock} unidades (${currentStock - newStock} unidades excedentes eliminadas).` 
      });
    } catch (err: any) {
      toast({ title: "Error al ajustar stock", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [productId, productName, currentStock, totalBatchQuantity, warehouseStock, batchWarehouseStock, queryClient, toast]);


  const handleAssignStock = async () => {
    if (!assignWarehouse) {
      toast({ title: "Selecciona un almacén", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const { data: existing } = await supabase
        .from("warehouse_stock")
        .select("id, current_stock")
        .eq("product_id", productId)
        .eq("warehouse_id", assignWarehouse)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("warehouse_stock")
          .update({ current_stock: existing.current_stock + (unassignedStock > 0 ? unassignedStock : currentStock) })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("warehouse_stock")
          .insert({
            product_id: productId,
            warehouse_id: assignWarehouse,
            current_stock: unassignedStock > 0 ? unassignedStock : currentStock,
          });
      }

      await supabase
        .from("products")
        .update({ warehouse_id: assignWarehouse })
        .eq("id", productId);

      const wName = warehouses.find((w: any) => w.id === assignWarehouse)?.name || "";
      logActivity({
        section: "inventario",
        action: "editar",
        entityType: "Producto",
        entityName: productName,
        details: { warehouse: wName, stock: unassignedStock > 0 ? unassignedStock : currentStock },
      });

      toast({ title: "Stock asignado", description: `${productName} asignado a ${wName}` });
      setShowAssignForm(false);
      setAssignWarehouse("");
      queryClient.invalidateQueries({ queryKey: ["product-warehouse-stock", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock-map"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  // Move stock between warehouses
  const handleMoveStock = async () => {
    if (!moveData.fromWarehouse || !moveData.toWarehouse || moveData.quantity <= 0) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    if (moveData.fromWarehouse === moveData.toWarehouse) {
      toast({ title: "Los almacenes deben ser diferentes", variant: "destructive" });
      return;
    }

    const sourceStock = warehouseStock.find((ws: WarehouseStockRow) => ws.warehouse_id === moveData.fromWarehouse);
    if (!sourceStock || sourceStock.current_stock < moveData.quantity) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${sourceStock?.current_stock || 0} unidades en el almacén de origen`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Move stock via batch_warehouse_stock (trigger syncs the rest)
      // Find batches in the source warehouse and move them FEFO
      const sourceBatches = batchWarehouseStock
        .filter((bws: BatchWarehouseRow) => bws.warehouse_id === moveData.fromWarehouse && bws.quantity > 0)
        .map((bws: BatchWarehouseRow) => {
          const batch = batches.find(b => b.id === bws.batch_id);
          return { ...bws, expiration_date: batch?.expiration_date || "" };
        })
        .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date));

      let remaining = moveData.quantity;
      for (const bws of sourceBatches) {
        if (remaining <= 0) break;
        const toMove = Math.min(remaining, bws.quantity);
        
        // Decrease source
        const newSourceQty = bws.quantity - toMove;
        if (newSourceQty === 0) {
          await (supabase as any).from("batch_warehouse_stock").delete().eq("id", bws.id);
        } else {
          await (supabase as any).from("batch_warehouse_stock").update({ quantity: newSourceQty }).eq("id", bws.id);
        }

        // Increase destination
        const { data: destBws } = await (supabase as any)
          .from("batch_warehouse_stock")
          .select("id, quantity")
          .eq("batch_id", bws.batch_id)
          .eq("warehouse_id", moveData.toWarehouse)
          .maybeSingle();

        if (destBws) {
          await (supabase as any).from("batch_warehouse_stock").update({ quantity: destBws.quantity + toMove }).eq("id", destBws.id);
        } else {
          await (supabase as any).from("batch_warehouse_stock").insert({
            batch_id: bws.batch_id,
            warehouse_id: moveData.toWarehouse,
            quantity: toMove,
          });
        }
        remaining -= toMove;
      }

      if (remaining > 0) {
        throw new Error(`No hay suficiente stock con lotes asignados para mover ${moveData.quantity} unidades`);
      }

      // Resync de seguridad contra race conditions del trigger
      await syncWarehouseStockFromBatches(productId);

      const fromName = warehouses.find((w: any) => w.id === moveData.fromWarehouse)?.name || "";
      const toName = warehouses.find((w: any) => w.id === moveData.toWarehouse)?.name || "";

      logActivity({
        section: "inventario",
        action: "transferencia",
        entityType: "Producto",
        entityName: productName,
        details: { from: fromName, to: toName, quantity: moveData.quantity },
      });

      toast({
        title: "Stock reubicado",
        description: `${moveData.quantity} unidades movidas de ${fromName} a ${toName}`,
      });
      setShowMoveForm(false);
      setMoveData({ fromWarehouse: "", toWarehouse: "", quantity: 1 });
      queryClient.invalidateQueries({ queryKey: ["product-warehouse-stock", productId] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock-map"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loadingStock) {
    return (
      <div className="border rounded-lg p-3 space-y-2 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-8 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Ubicación en Almacenes
          </span>
        </div>
        <div className="flex items-center gap-1">
          {batches.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowBatchAssignModal(true)}
            >
              <Layers className="h-3 w-3" />
              Asignar lotes
            </Button>
          )}
          {warehouseStock.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => { setShowMoveForm(!showMoveForm); setShowAssignForm(false); }}
            >
              <ArrowRightLeft className="h-3 w-3" />
              Mover stock
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={isProcessing || currentStock <= 0}
              >
                <Trash2 className="h-3 w-3" />
                Eliminar excedente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar excedente de stock?</AlertDialogTitle>
                <AlertDialogDescription>
                  El stock global de <strong>{productName}</strong> se ajustará de <strong>{currentStock}</strong> a <strong>{Math.max(totalBatchQuantity, totalDistributed)}</strong> unidades (basado en lotes y almacenes reales).
                  <br /><br />
                  Se eliminarán <strong>{currentStock - Math.max(totalBatchQuantity, totalDistributed)}</strong> unidades excedentes. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEliminateExcess}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sí, eliminar excedente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Warning: stock sin asignar */}
      {(hasNoWarehouse || unassignedStock > 0) && (
        <div className="flex items-start gap-2 p-2 bg-warning/10 border border-warning/30 rounded-md">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
          <div className="text-xs flex-1">
            <p className="font-medium text-destructive">
              {hasNoWarehouse
                ? `${currentStock} unidades sin almacén asignado`
                : `${unassignedStock} unidades sin ubicar`}
            </p>
            <p className="text-muted-foreground mt-0.5">
              Asigna este producto a un almacén para control correcto.
            </p>
            <div className="flex items-center gap-2 mt-1">
              {!showAssignForm && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-primary"
                  onClick={() => { setShowAssignForm(true); setShowMoveForm(false); }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Asignar a almacén
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign form */}
      {showAssignForm && (
        <div className="p-2 bg-muted/50 rounded-md space-y-2">
          <Label className="text-xs">Asignar stock a almacén</Label>
          <div className="flex gap-2">
            <Select value={assignWarehouse} onValueChange={setAssignWarehouse}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Seleccionar almacén..." />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleAssignStock}
              disabled={isProcessing || !assignWarehouse}
            >
              {isProcessing ? "..." : "Asignar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowAssignForm(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Stock distribution with expandable batch details */}
      {warehouseStock.length > 0 && (
        <div className="space-y-1">
          {warehouseStock.map((ws: WarehouseStockRow) => {
            const isExpanded = expandedWarehouse === ws.warehouse_id;
            const whBatches = batchesByWarehouse[ws.warehouse_id] || [];

            return (
              <div key={ws.id} className="rounded overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between py-1.5 px-2 bg-muted/30 rounded text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedWarehouse(isExpanded ? null : ws.warehouse_id)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="font-medium">{ws.warehouse_name}</span>
                    {whBatches.length > 0 && (
                      <span className="text-muted-foreground">
                        ({whBatches.length} lote{whBatches.length > 1 ? "s" : ""})
                      </span>
                    )}
                  </div>
                  <Badge variant={ws.current_stock > 0 ? "default" : "secondary"} className="text-xs">
                    {ws.current_stock} uds
                  </Badge>
                </button>

                {/* Expanded batch details */}
                {isExpanded && whBatches.length > 0 && (
                  <div className="ml-5 mt-1 space-y-0.5 pb-1">
                    {whBatches.map((item) => {
                      const isExpiring =
                        new Date(item.batch.expiration_date) <
                        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                      return (
                        <div
                          key={item.batch.id}
                          className="flex items-center justify-between py-1 px-2 bg-muted/15 rounded text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{item.batch.batch_number}</span>
                            <span
                              className={
                                isExpiring ? "text-destructive font-medium" : "text-muted-foreground"
                              }
                            >
                              Cad: {format(new Date(item.batch.expiration_date), "MMM yyyy", { locale: es })}
                            </span>
                          </div>
                          <span className="font-medium">{item.quantity} uds</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isExpanded && whBatches.length === 0 && (
                  <div className="ml-5 mt-1 pb-1">
                    <p className="text-xs text-muted-foreground italic px-2 py-1">
                      Sin lotes asignados a este almacén
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned batches section */}
      {unassignedBatches.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-warning">
              <AlertTriangle className="h-3 w-3" />
              Lotes sin asignar a almacén ({unassignedBatches.length})
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => setShowBatchAssignModal(true)}
            >
              <Layers className="h-3 w-3" />
              Asignar
            </Button>
          </div>
          {unassignedBatches.map((batch) => {
            const isExpiring =
              new Date(batch.expiration_date) <
              new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            return (
              <div
                key={batch.id}
                className="flex items-center justify-between py-1.5 px-2 bg-warning/5 border border-warning/20 rounded text-xs"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-3 w-3 text-warning" />
                  <span className="font-medium">{batch.batch_number}</span>
                  <span className={isExpiring ? "text-destructive" : "text-muted-foreground"}>
                    Cad: {format(new Date(batch.expiration_date), "MMM yyyy", { locale: es })}
                  </span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {batch.current_quantity} uds
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* No stock at all */}
      {warehouseStock.length === 0 && currentStock === 0 && batches.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Sin stock registrado
        </p>
      )}

      {/* Move stock form */}
      {showMoveForm && (
        <div className="p-2 bg-muted/50 rounded-md space-y-2 border">
          <Label className="text-xs font-medium">Reubicar stock</Label>
          <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Origen</Label>
              <Select
                value={moveData.fromWarehouse}
                onValueChange={(v) => setMoveData({ ...moveData, fromWarehouse: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Origen..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouseStock.map((ws: WarehouseStockRow) => (
                    <SelectItem key={ws.warehouse_id} value={ws.warehouse_id}>
                      {ws.warehouse_name} ({ws.current_stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Destino</Label>
              <Select
                value={moveData.toWarehouse}
                onValueChange={(v) => setMoveData({ ...moveData, toWarehouse: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Destino..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w: any) => w.id !== moveData.fromWarehouse)
                    .map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="space-y-1 w-24">
              <Label className="text-[10px] text-muted-foreground">Cantidad</Label>
              <Input
                type="number"
                min={1}
                max={
                  warehouseStock.find((ws: WarehouseStockRow) => ws.warehouse_id === moveData.fromWarehouse)
                    ?.current_stock || 999
                }
                value={moveData.quantity}
                onChange={(e) =>
                  setMoveData({ ...moveData, quantity: parseInt(e.target.value) || 1 })
                }
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleMoveStock}
              disabled={isProcessing}
            >
              {isProcessing ? "Moviendo..." : "Confirmar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowMoveForm(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <BatchWarehouseAssignModal
        open={showBatchAssignModal}
        onOpenChange={setShowBatchAssignModal}
        productId={productId}
        productName={productName}
      />
    </div>
  );
}
