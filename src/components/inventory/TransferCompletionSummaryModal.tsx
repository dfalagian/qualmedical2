import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Package,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TransferredItem {
  product_id: string;
  product_name: string;
  product_sku?: string;
  batch_number?: string;
  quantity: number;
}

interface StockSnapshot {
  product_id: string;
  product_name: string;
  product_sku?: string;
  source_before: number;
  source_after: number;
  dest_before: number;
  dest_after: number;
  quantity_transferred: number;
}

interface OmittedProduct {
  product_id: string;
  product_name: string;
  product_sku?: string;
  source_stock: number;
}

interface TransferCompletionSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  transferredItems: TransferredItem[];
}

export function TransferCompletionSummaryModal({
  open,
  onOpenChange,
  fromWarehouseId,
  fromWarehouseName,
  toWarehouseId,
  toWarehouseName,
  transferredItems,
}: TransferCompletionSummaryModalProps) {
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const transferredProductIds = [...new Set(transferredItems.map((i) => i.product_id))];

  // Fetch current warehouse_stock for transferred products
  const { data: stockSnapshots = [] } = useQuery({
    queryKey: ["transfer-summary-stock", fromWarehouseId, toWarehouseId, transferredProductIds],
    queryFn: async () => {
      if (transferredProductIds.length === 0) return [];

      const { data: wsData } = await supabase
        .from("warehouse_stock")
        .select("product_id, warehouse_id, current_stock")
        .in("product_id", transferredProductIds)
        .in("warehouse_id", [fromWarehouseId, toWarehouseId]);

      // Build snapshots per product
      const productMap = new Map<string, StockSnapshot>();

      // Aggregate transferred quantities per product
      for (const item of transferredItems) {
        if (!productMap.has(item.product_id)) {
          productMap.set(item.product_id, {
            product_id: item.product_id,
            product_name: item.product_name,
            product_sku: item.product_sku,
            source_before: 0,
            source_after: 0,
            dest_before: 0,
            dest_after: 0,
            quantity_transferred: 0,
          });
        }
        const snapshot = productMap.get(item.product_id)!;
        snapshot.quantity_transferred += item.quantity;
      }

      // Fill in current stock (which is AFTER the transfer)
      for (const ws of wsData || []) {
        const snapshot = productMap.get(ws.product_id);
        if (!snapshot) continue;

        if (ws.warehouse_id === fromWarehouseId) {
          snapshot.source_after = ws.current_stock;
          snapshot.source_before = ws.current_stock + snapshot.quantity_transferred;
        } else if (ws.warehouse_id === toWarehouseId) {
          snapshot.dest_after = ws.current_stock;
          snapshot.dest_before = ws.current_stock - snapshot.quantity_transferred;
        }
      }

      return Array.from(productMap.values());
    },
    enabled: open && transferredProductIds.length > 0,
  });

  // Fetch ALL products with stock in source warehouse that were NOT transferred
  const { data: omittedProducts = [] } = useQuery({
    queryKey: ["transfer-summary-omitted", fromWarehouseId, transferredProductIds],
    queryFn: async () => {
      const { data: wsData } = await supabase
        .from("warehouse_stock")
        .select("product_id, current_stock, products:product_id(name, sku)")
        .eq("warehouse_id", fromWarehouseId)
        .gt("current_stock", 0);

      return (wsData || [])
        .filter((ws: any) => !transferredProductIds.includes(ws.product_id))
        .map((ws: any) => ({
          product_id: ws.product_id,
          product_name: ws.products?.name || "Sin nombre",
          product_sku: ws.products?.sku || "",
          source_stock: ws.current_stock,
        }))
        .sort((a: OmittedProduct, b: OmittedProduct) => a.product_name.localeCompare(b.product_name));
    },
    enabled: open,
  });

  const totalTransferred = transferredItems.reduce((s, i) => s + i.quantity, 0);
  const hasOmitted = omittedProducts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Resumen de Transferencia Completada
          </DialogTitle>
          <DialogDescription>
            Revisión del movimiento de stock entre almacenes.
          </DialogDescription>
        </DialogHeader>

        {/* Transfer route info */}
        <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <span className="font-semibold text-sm">{fromWarehouseName}</span>
          <ArrowRight className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-sm">{toWarehouseName}</span>
          <Badge className="bg-emerald-600 text-white ml-auto">
            {totalTransferred} unidad{totalTransferred !== 1 ? "es" : ""} transferida{totalTransferred !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Stock detail section */}
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="font-medium text-sm">
                Detalle de Stock ({stockSnapshots.length} producto{stockSnapshots.length !== 1 ? "s" : ""})
              </span>
            </div>
            {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border rounded-lg mt-2 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Transferido</TableHead>
                    <TableHead className="text-center">{fromWarehouseName}</TableHead>
                    <TableHead className="text-center">{toWarehouseName}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockSnapshots.map((snap) => (
                    <TableRow key={snap.product_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{snap.product_name}</div>
                          {snap.product_sku && (
                            <div className="text-xs text-muted-foreground">{snap.product_sku}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">
                          {snap.quantity_transferred}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <span className="text-muted-foreground">{snap.source_before}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className={cn(
                            "font-semibold",
                            snap.source_after === 0 ? "text-amber-600" : "text-foreground"
                          )}>
                            {snap.source_after}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <span className="text-muted-foreground">{Math.max(0, snap.dest_before)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-semibold text-emerald-600">
                            {snap.dest_after}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Omitted products alert */}
        {hasOmitted && (
          <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-sm text-amber-800">
                  {omittedProducts.length} producto{omittedProducts.length !== 1 ? "s" : ""} con stock en {fromWarehouseName} no incluido{omittedProducts.length !== 1 ? "s" : ""} en esta transferencia
                </span>
              </div>
              {alertsOpen ? <ChevronUp className="h-4 w-4 text-amber-600" /> : <ChevronDown className="h-4 w-4 text-amber-600" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border border-amber-200 rounded-lg mt-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-amber-50/50">
                      <TableHead>Producto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-center">Stock en {fromWarehouseName}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {omittedProducts.map((prod) => (
                      <TableRow key={prod.product_id} className="bg-amber-50/30">
                        <TableCell className="text-sm font-medium">{prod.product_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{prod.product_sku}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-amber-700 border-amber-300">
                            {prod.source_stock} ud{prod.source_stock !== 1 ? "s" : ""}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-amber-700 mt-2 px-1">
                ⚠️ Verifique si alguno de estos productos debió incluirse en la transferencia. 
                Si se movieron físicamente sin registrar, puede crear una nueva transferencia para corregir la distribución.
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {!hasOmitted && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-emerald-800">
              No hay productos pendientes en {fromWarehouseName} que no hayan sido incluidos.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
