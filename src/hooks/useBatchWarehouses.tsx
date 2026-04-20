import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

/**
 * Returns a map: batch_id -> Array<{ warehouse_id, warehouse_name, quantity }>
 * Only includes warehouses where the batch actually has stock (quantity > 0).
 *
 * Used to filter the "Almacén" dropdown when a lote is selected, ensuring
 * that the user can only assign warehouses where the batch physically exists.
 */
export function useBatchWarehouses(batchIds: string[]) {
  // Stabilize the key — sort + join to avoid re-fetching when order changes
  const stableIds = useMemo(() => Array.from(new Set(batchIds)).sort(), [batchIds]);

  const query = useQuery({
    queryKey: ["batch-warehouses", stableIds],
    enabled: stableIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("batch_warehouse_stock")
        .select("batch_id, warehouse_id, quantity, warehouses:warehouse_id(id, name)")
        .in("batch_id", stableIds)
        .gt("quantity", 0);
      if (error) throw error;

      const map: Record<
        string,
        Array<{ warehouse_id: string; warehouse_name: string; quantity: number }>
      > = {};
      for (const row of (data || []) as any[]) {
        if (!map[row.batch_id]) map[row.batch_id] = [];
        map[row.batch_id].push({
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouses?.name || "Almacén",
          quantity: row.quantity,
        });
      }
      return map;
    },
  });

  return {
    batchWarehousesMap: query.data || {},
    isLoading: query.isLoading,
  };
}
