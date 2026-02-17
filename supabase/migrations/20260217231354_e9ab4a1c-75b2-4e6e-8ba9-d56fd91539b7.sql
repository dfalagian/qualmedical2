
-- Crear productos en Almacén CITIO basados en el traslado del 11/02/2026
-- usando SECURITY DEFINER para bypassar RLS
DO $$
DECLARE
  citio_warehouse_id uuid := 'd36d1b4e-8c68-4946-bb1b-86126805a3d6';
  principal_warehouse_id uuid := 'eccd60f4-3538-4594-bdd1-6897bfdfe8d8';
BEGIN
  INSERT INTO public.products (
    name, sku, brand, category, description, barcode, unit, minimum_stock,
    price_type_1, price_type_2, price_type_3, price_type_4, price_type_5,
    price_with_tax, price_without_tax, tax_rate, rfid_required, is_active,
    codigo_sat, grupo_sat, citio_id, supplier_id, warehouse_id, current_stock
  )
  SELECT 
    p.name, p.sku, p.brand, p.category, p.description, p.barcode, p.unit, p.minimum_stock,
    p.price_type_1, p.price_type_2, p.price_type_3, p.price_type_4, p.price_type_5,
    p.price_with_tax, p.price_without_tax, p.tax_rate, p.rfid_required, p.is_active,
    p.codigo_sat, p.grupo_sat, p.citio_id, p.supplier_id,
    citio_warehouse_id AS warehouse_id,
    SUM(wt.quantity) AS current_stock
  FROM public.warehouse_transfers wt
  JOIN public.products p ON p.id = wt.product_id
  WHERE wt.from_warehouse_id = principal_warehouse_id
    AND wt.to_warehouse_id = citio_warehouse_id
    AND wt.created_at >= '2026-02-11 00:00:00+00'
    AND wt.created_at < '2026-02-12 00:00:00+00'
    AND wt.transfer_type = 'manual'
    AND p.warehouse_id = principal_warehouse_id
  GROUP BY 
    p.id, p.name, p.sku, p.brand, p.category, p.description, p.barcode, p.unit, p.minimum_stock,
    p.price_type_1, p.price_type_2, p.price_type_3, p.price_type_4, p.price_type_5,
    p.price_with_tax, p.price_without_tax, p.tax_rate, p.rfid_required, p.is_active,
    p.codigo_sat, p.grupo_sat, p.citio_id, p.supplier_id
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Productos creados en Almacén CITIO: %', (
    SELECT COUNT(*) FROM public.products WHERE warehouse_id = citio_warehouse_id
  );
END;
$$;
