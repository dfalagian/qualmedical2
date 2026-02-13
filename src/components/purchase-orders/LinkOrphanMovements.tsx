import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  Link2,
  PackageSearch,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface LinkOrphanMovementsProps {
  order: {
    id: string;
    order_number: string;
    supplier_id: string;
    purchase_order_items?: Array<{
      id: string;
      product_id: string;
      quantity_ordered: number;
      quantity_received: number | null;
      products?: { id: string; name: string; sku: string } | null;
    }>;
  };
}

interface OrphanMovement {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  notes: string | null;
  location: string | null;
  product_name: string;
}

export function LinkOrphanMovements({ order }: LinkOrphanMovementsProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const productIds = (order.purchase_order_items || []).map((i) => i.product_id);

  const { data: orphanMovements = [], isLoading } = useQuery({
    queryKey: ["orphan-movements", order.id, productIds],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, product_id, quantity, created_at, notes, location, movement_type")
        .in("product_id", productIds)
        .eq("movement_type", "entrada")
        .is("reference_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Enrich with product names
      const productMap = new Map(
        (order.purchase_order_items || []).map((i) => [
          i.product_id,
          i.products?.name || "Producto",
        ])
      );
      return (data || []).map((m) => ({
        ...m,
        product_name: productMap.get(m.product_id) || "Producto",
      })) as OrphanMovement[];
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (movementIds: string[]) => {
      // 1. Link movements to this PO
      const { error: linkError } = await supabase
        .from("inventory_movements")
        .update({
          reference_id: order.id,
          reference_type: "purchase_order",
        })
        .in("id", movementIds);
      if (linkError) throw linkError;

      // 2. Calculate quantities per product from selected movements
      const selectedMovements = orphanMovements.filter((m) =>
        movementIds.includes(m.id)
      );
      const qtyByProduct = new Map<string, number>();
      for (const m of selectedMovements) {
        qtyByProduct.set(
          m.product_id,
          (qtyByProduct.get(m.product_id) || 0) + m.quantity
        );
      }

      // 3. Update quantity_received in purchase_order_items
      for (const [productId, qty] of qtyByProduct) {
        const item = (order.purchase_order_items || []).find(
          (i) => i.product_id === productId
        );
        if (item) {
          const newReceived = (item.quantity_received || 0) + qty;
          const { error } = await supabase
            .from("purchase_order_items")
            .update({ quantity_received: newReceived })
            .eq("id", item.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Movimientos vinculados correctamente a la OC");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["orphan-movements"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-movements"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al vincular movimientos");
    },
  });

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === orphanMovements.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orphanMovements.map((m) => m.id)));
    }
  };

  const handleLink = () => {
    if (selectedIds.size === 0) {
      toast.error("Selecciona al menos un movimiento");
      return;
    }
    linkMutation.mutate(Array.from(selectedIds));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Buscando movimientos sin vincular...
      </div>
    );
  }

  if (orphanMovements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
        <CheckCircle2 className="h-8 w-8 text-success" />
        <p className="text-sm font-medium">
          No hay movimientos de ingreso sin vincular para los productos de esta OC
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <p className="text-sm">
          Se encontraron <strong>{orphanMovements.length}</strong> ingresos de
          inventario sin OC vinculada para los productos de esta orden.
          Selecciona los que correspondan a esta OC.
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 w-10">
                <Checkbox
                  checked={
                    selectedIds.size === orphanMovements.length &&
                    orphanMovements.length > 0
                  }
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="text-left p-3 font-medium">Producto</th>
              <th className="text-center p-3 font-medium w-24">Cantidad</th>
              <th className="text-left p-3 font-medium">Notas</th>
              <th className="text-left p-3 font-medium w-40">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orphanMovements.map((m) => (
              <tr
                key={m.id}
                className={`hover:bg-muted/20 cursor-pointer ${
                  selectedIds.has(m.id) ? "bg-primary/5" : ""
                }`}
                onClick={() => toggleSelection(m.id)}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selectedIds.has(m.id)}
                    onCheckedChange={() => toggleSelection(m.id)}
                  />
                </td>
                <td className="p-3">
                  <p className="font-medium text-xs">{m.product_name}</p>
                </td>
                <td className="p-3 text-center">
                  <Badge variant="secondary">{m.quantity}</Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground truncate max-w-48">
                  {m.notes || "—"}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedIds.size} de {orphanMovements.length} seleccionados
        </p>
        <Button
          onClick={handleLink}
          disabled={selectedIds.size === 0 || linkMutation.isPending}
          className="gap-2"
        >
          {linkMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          Vincular a {order.order_number}
        </Button>
      </div>
    </div>
  );
}
