
-- Fix VINCRISTINA current_stock: 14 → 12
UPDATE products 
SET current_stock = 12 
WHERE id = 'aa2f00ce-a0e7-4a09-9c83-57331e5734cf' AND current_stock = 14;

-- Fix warehouse_stock for Principal: 8 → 6
UPDATE warehouse_stock 
SET current_stock = 6 
WHERE product_id = 'aa2f00ce-a0e7-4a09-9c83-57331e5734cf' 
AND warehouse_id = 'eccd60f4-3538-4594-bdd1-6897bfdfe8d8'
AND current_stock = 8;

-- Fix inventory_movements with null location from today's entries
UPDATE inventory_movements 
SET location = 'eccd60f4-3538-4594-bdd1-6897bfdfe8d8'
WHERE product_id IN ('aa2f00ce-a0e7-4a09-9c83-57331e5734cf', 'b81c56d7-3f61-42a3-aa06-e37dcaa6d0cf')
AND location IS NULL 
AND movement_type = 'entrada'
AND created_at >= '2026-04-08';
