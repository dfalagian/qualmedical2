import { supabase } from "@/integrations/supabase/client";

/**
 * Recalculates warehouse_stock for a given product based on the sum of
 * batch_warehouse_stock entries for all active batches of that product.
 * 
 * This ensures that when users assign batches to warehouses via batch_warehouse_stock,
 * the warehouse_stock table (used for the main inventory view) stays in sync.
 */
export async function syncWarehouseStockFromBatches(productId: string) {
  // 1. Get all active batches for this product
  const { data: batches, error: batchErr } = await supabase
    .from("product_batches")
    .select("id")
    .eq("product_id", productId)
    .eq("is_active", true);

  if (batchErr) throw batchErr;
  if (!batches || batches.length === 0) return;

  const batchIds = batches.map((b) => b.id);

  // 2. Get all batch_warehouse_stock entries for these batches
  const { data: bwsData, error: bwsErr } = await (supabase as any)
    .from("batch_warehouse_stock")
    .select("warehouse_id, quantity")
    .in("batch_id", batchIds);

  if (bwsErr) throw bwsErr;

  // 3. Sum quantities per warehouse
  const warehouseTotals: Record<string, number> = {};
  for (const row of bwsData || []) {
    if (row.quantity > 0) {
      warehouseTotals[row.warehouse_id] = (warehouseTotals[row.warehouse_id] || 0) + row.quantity;
    }
  }

  // 4. Get current warehouse_stock records for this product
  const { data: currentWS, error: wsErr } = await supabase
    .from("warehouse_stock")
    .select("id, warehouse_id, current_stock")
    .eq("product_id", productId);

  if (wsErr) throw wsErr;

  const existingMap = new Map((currentWS || []).map((ws) => [ws.warehouse_id, ws]));

  // 5. Upsert warehouse_stock: update existing, insert new, delete zeroed
  for (const [warehouseId, total] of Object.entries(warehouseTotals)) {
    const existing = existingMap.get(warehouseId);
    if (existing) {
      if (existing.current_stock !== total) {
        await supabase
          .from("warehouse_stock")
          .update({ current_stock: total })
          .eq("id", existing.id);
      }
      existingMap.delete(warehouseId);
    } else {
      await supabase
        .from("warehouse_stock")
        .insert({
          product_id: productId,
          warehouse_id: warehouseId,
          current_stock: total,
        });
    }
  }

  // 6. For warehouses that no longer have any batch stock, set to 0
  for (const [, remaining] of existingMap) {
    if (remaining.current_stock !== 0) {
      await supabase
        .from("warehouse_stock")
        .update({ current_stock: 0 })
        .eq("id", remaining.id);
    }
  }
}
