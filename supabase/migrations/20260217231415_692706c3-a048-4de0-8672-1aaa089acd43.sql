
-- Actualizar warehouse_id de los productos transferidos al Almacén CITIO
-- El modelo no permite duplicar productos (SKU único), por lo que el traslado mueve el producto
UPDATE public.products p
SET warehouse_id = 'd36d1b4e-8c68-4946-bb1b-86126805a3d6',
    updated_at = NOW()
WHERE p.id IN (
  SELECT DISTINCT wt.product_id
  FROM public.warehouse_transfers wt
  WHERE wt.from_warehouse_id = 'eccd60f4-3538-4594-bdd1-6897bfdfe8d8'
    AND wt.to_warehouse_id = 'd36d1b4e-8c68-4946-bb1b-86126805a3d6'
    AND wt.created_at >= '2026-02-11 00:00:00+00'
    AND wt.created_at < '2026-02-12 00:00:00+00'
    AND wt.transfer_type = 'manual'
)
AND p.warehouse_id = 'eccd60f4-3538-4594-bdd1-6897bfdfe8d8';
