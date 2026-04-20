import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncWarehouseStockFromBatches } from "@/lib/syncWarehouseStock";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Printer, CheckCircle2, ArrowDownUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SessionCount {
  id: string;
  product_id: string;
  batch_id: string | null;
  warehouse_id: string;
  counted_quantity: number;
  system_quantity: number;
  difference: number | null;
  notes: string | null;
  counted_at: string;
  session_warehouse_name: string | null;
  products?: { name: string; sku: string; brand: string | null } | null;
  product_batches?: { batch_number: string } | null;
  warehouses?: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: SessionCount[];
  warehouseName: string;
  sessionDate: string;
  sessionId: string;
}

export function PhysicalCountSessionView({ open, onOpenChange, counts, warehouseName, sessionDate, sessionId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCounts = useMemo(() => {
    if (!search.trim()) return counts;
    const q = search.toLowerCase();
    return counts.filter((c) => {
      const name = c.products?.name?.toLowerCase() || "";
      const sku = c.products?.sku?.toLowerCase() || "";
      return name.includes(q) || sku.includes(q);
    });
  }, [counts, search]);

  // Check if adjustments have already been applied for this session
  const { data: adjustmentsApplied = false, isLoading: checkingAdjustments } = useQuery({
    queryKey: ["physical-count-adjustments", sessionId],
    enabled: open && !!sessionId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("inventory_movements")
        .select("id", { count: "exact", head: true })
        .eq("reference_type", "physical_count")
        .eq("reference_id", sessionId);
      if (error) throw error;
      return (count || 0) > 0;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const itemsWithDiff = counts.filter((c) => c.counted_quantity - c.system_quantity !== 0);
      if (itemsWithDiff.length === 0) throw new Error("No hay diferencias que ajustar");

      // Group diffs by product+warehouse to accumulate correctly for multiple batches
      const warehouseStockDiffs = new Map<string, { product_id: string; warehouse_id: string; totalDiff: number }>();

      for (const c of itemsWithDiff) {
        const diff = c.counted_quantity - c.system_quantity;
        const movementType = diff > 0 ? "entrada" : "salida";
        const quantity = Math.abs(diff);

        // 1. Insert inventory movement (trigger updates products.current_stock)
        const { error: movError } = await supabase
          .from("inventory_movements")
          .insert({
            product_id: c.product_id,
            batch_id: c.batch_id,
            movement_type: movementType,
            quantity,
            reference_type: "physical_count",
            reference_id: sessionId,
            location: warehouseName,
            notes: `Ajuste por conteo físico (${c.system_quantity} → ${c.counted_quantity})`,
            created_by: user?.id,
          });
        if (movError) throw movError;

        // 2. Update batch_warehouse_stock (trigger syncs product_batches, warehouse_stock, products)
        if (c.batch_id) {
          const { data: bwsRow } = await (supabase as any)
            .from("batch_warehouse_stock")
            .select("id, quantity")
            .eq("batch_id", c.batch_id)
            .eq("warehouse_id", c.warehouse_id)
            .maybeSingle();

          if (bwsRow) {
            const newQty = Math.max(0, bwsRow.quantity + diff);
            if (newQty === 0) {
              await (supabase as any)
                .from("batch_warehouse_stock")
                .delete()
                .eq("id", bwsRow.id);
            } else {
              await (supabase as any)
                .from("batch_warehouse_stock")
                .update({ quantity: newQty })
                .eq("id", bwsRow.id);
            }
          } else if (diff > 0) {
            // Batch exists in this warehouse but no record yet — create it
            await (supabase as any)
              .from("batch_warehouse_stock")
              .insert({
                batch_id: c.batch_id,
                warehouse_id: c.warehouse_id,
                quantity: diff,
              });
          }
        }
      }

      // Resync de seguridad: recalcular warehouse_stock para cada producto afectado
      const affectedProductIds = [...new Set(itemsWithDiff.map(c => c.product_id))];
      for (const pid of affectedProductIds) {
        await syncWarehouseStockFromBatches(pid);
      }
    },
    onSuccess: () => {
      toast.success("Ajustes de stock aplicados correctamente");
      queryClient.invalidateQueries({ queryKey: ["physical-count-adjustments", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["physical-inv-sessions"] });
      setShowConfirm(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al aplicar ajustes");
      setShowConfirm(false);
    },
  });

  const handlePrint = () => {
    const productGroups: Record<string, SessionCount[]> = {};
    counts.forEach((c) => {
      const pid = c.product_id;
      if (!productGroups[pid]) productGroups[pid] = [];
      productGroups[pid].push(c);
    });

    const html = `
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8">
        <title>Conteo Físico - ${warehouseName}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .header-info { color: #666; margin-bottom: 16px; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f5f5f5; font-size: 11px; }
          .total-row { background: #f0f0f0; font-weight: bold; }
          .diff-ok { color: green; }
          .diff-bad { color: red; font-weight: bold; }
          .text-center { text-align: center; }
          @media print { body { margin: 10px; } }
        </style>
      </head><body>
        <h1>Reporte de Conteo Físico</h1>
        <div class="header-info">
          <strong>Almacén:</strong> ${warehouseName} &nbsp;&nbsp;|&nbsp;&nbsp;
          <strong>Fecha:</strong> ${new Date(sessionDate).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <strong>Total productos:</strong> ${Object.keys(productGroups).length}
        </div>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Marca</th>
              <th>Lote</th>
              <th class="text-center">Qty Sistema</th>
              <th class="text-center">Qty Contada</th>
              <th class="text-center">Diferencia</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(productGroups).map((group) => {
              const productName = group[0].products?.name || "—";
              const rows = group.map((c, i) => {
                const diff = c.counted_quantity - c.system_quantity;
                const productSku = group[0].products?.sku || "—";
                const productBrand = group[0].products?.brand || "—";
                return `<tr>
                  <td>${i === 0 ? productName : ""}</td>
                  <td>${i === 0 ? productSku : ""}</td>
                  <td>${i === 0 ? productBrand : ""}</td>
                  <td>${c.product_batches?.batch_number || "—"}</td>
                  <td class="text-center">${c.system_quantity}</td>
                  <td class="text-center">${c.counted_quantity}</td>
                  <td class="text-center ${diff === 0 ? "diff-ok" : "diff-bad"}">${diff === 0 ? "OK" : (diff > 0 ? "+" : "") + diff}</td>
                  <td>${c.notes || ""}</td>
                </tr>`;
              }).join("");

              if (group.length > 1) {
                const totalSys = group.reduce((s, c) => s + c.system_quantity, 0);
                const totalCounted = group.reduce((s, c) => s + c.counted_quantity, 0);
                const totalDiff = totalCounted - totalSys;
                return rows + `<tr class="total-row">
                   <td colspan="4" style="text-align:right">Total ${productName}:</td>
                  <td class="text-center">${totalSys}</td>
                  <td class="text-center">${totalCounted}</td>
                  <td class="text-center ${totalDiff === 0 ? "diff-ok" : "diff-bad"}">${totalDiff === 0 ? "OK" : (totalDiff > 0 ? "+" : "") + totalDiff}</td>
                  <td></td>
                </tr>`;
              }
              return rows;
            }).join("")}
          </tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body></html>
    `;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  const totalSystem = counts.reduce((s, c) => s + c.system_quantity, 0);
  const totalCounted = counts.reduce((s, c) => s + c.counted_quantity, 0);
  const withDiff = counts.filter((c) => c.counted_quantity - c.system_quantity !== 0).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Detalle de Conteo Físico</span>
              <div className="flex items-center gap-2">
                {withDiff > 0 && !adjustmentsApplied && !checkingAdjustments && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowConfirm(true)}
                    className="gap-1.5"
                  >
                    <ArrowDownUp className="h-4 w-4" />
                    Aplicar ajustes
                  </Button>
                )}
                {adjustmentsApplied && (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Ajustes aplicados
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                  <Printer className="h-4 w-4" />
                  Imprimir PDF
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <span><strong>Almacén:</strong> {warehouseName}</span>
            <span><strong>Fecha:</strong> {new Date(sessionDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <span><strong>Registros:</strong> {counts.length}</span>
            {withDiff > 0 && <Badge variant="destructive">{withDiff} con diferencia</Badge>}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-center">Qty Sistema</TableHead>
                <TableHead className="text-center">Qty Contada</TableHead>
                <TableHead className="text-center">Diferencia</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCounts.map((c) => {
                const diff = c.counted_quantity - c.system_quantity;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm">{c.products?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {c.products?.sku || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {c.product_batches?.batch_number || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono">{c.system_quantity}</TableCell>
                    <TableCell className="text-center font-mono">{c.counted_quantity}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={diff === 0 ? "secondary" : "destructive"}
                        className={diff === 0 ? "bg-green-100 text-green-800" : ""}
                      >
                        {diff === 0 ? <><CheckCircle2 className="h-3 w-3 mr-1" />OK</> : `${diff > 0 ? "+" : ""}${diff}`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.notes || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex justify-between text-sm mt-2 border-t pt-2">
            <span>Total Sistema: <strong>{totalSystem}</strong></span>
            <span>Total Contado: <strong>{totalCounted}</strong></span>
            <span>Diferencia global: <strong className={totalCounted - totalSystem !== 0 ? "text-destructive" : "text-green-600"}>
              {totalCounted - totalSystem === 0 ? "OK" : `${totalCounted - totalSystem > 0 ? "+" : ""}${totalCounted - totalSystem}`}
            </strong></span>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aplicar ajustes de stock?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Se ajustará el stock de <strong>{withDiff}</strong> registro(s) con diferencias.
                El stock del sistema se actualizará a las cantidades contadas físicamente.
              </p>
              <p className="text-xs text-muted-foreground">
                Esta acción creará movimientos de inventario de tipo entrada/salida para cada diferencia encontrada.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                applyMutation.mutate();
              }}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aplicando...</>
              ) : (
                "Confirmar y aplicar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
