-- Desactivar triggers legacy que duplican la lógica de stock.
-- La fuente de verdad es batch_warehouse_stock con su trigger sync_stock_from_batch_warehouse,
-- que actualiza automáticamente product_batches.current_quantity, warehouse_stock.current_stock
-- y products.current_stock.

-- 1) Desactivar trigger en inventory_movements (causaba doble descuento en ventas con RFID/NFC)
DROP TRIGGER IF EXISTS trigger_update_product_stock ON public.inventory_movements;

-- 2) Desactivar trigger en medicine_counts (también modificaba products.current_stock directamente)
DROP TRIGGER IF EXISTS update_stock_on_medicine_count ON public.medicine_counts;

-- Las funciones se conservan por si alguna migración futura las necesita, pero no se ejecutan automáticamente.
-- Si en el futuro se desea reactivar la actualización de purchase_order_items.quantity_received
-- desde medicine_counts, se puede crear un nuevo trigger que SOLO actualice ese campo,
-- sin tocar products.current_stock (la SSOT lo gestiona).