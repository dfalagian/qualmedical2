
-- Corregir el stock de los productos en Almacén CITIO
-- El stock debe ser igual a la cantidad transferida el 11/02/2026
UPDATE public.products p
SET current_stock = subq.cantidad_transferida,
    updated_at = NOW()
FROM (
  SELECT 
    wt.product_id,
    SUM(wt.quantity) as cantidad_transferida
  FROM public.warehouse_transfers wt
  WHERE wt.to_warehouse_id = 'd36d1b4e-8c68-4946-bb1b-86126805a3d6'
    AND wt.created_at >= '2026-02-11 00:00:00+00'
    AND wt.created_at < '2026-02-12 00:00:00+00'
    AND wt.transfer_type = 'manual'
  GROUP BY wt.product_id
) subq
WHERE p.id = subq.product_id
  AND p.warehouse_id = 'd36d1b4e-8c68-4946-bb1b-86126805a3d6';
