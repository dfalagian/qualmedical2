-- Corregir stocks negativos en CITIO a 0 y devolver el exceso a Principal
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT ws.product_id, ws.current_stock
    FROM warehouse_stock ws
    WHERE ws.warehouse_id = 'd36d1b4e-8c68-4946-bb1b-86126805a3d6'
    AND ws.current_stock < 0
  LOOP
    -- Restar el exceso de Principal (lo que se sumó de más)
    UPDATE warehouse_stock 
    SET current_stock = current_stock + r.current_stock, updated_at = NOW()
    WHERE product_id = r.product_id 
    AND warehouse_id = 'eccd60f4-3538-4594-bdd1-6897bfdfe8d8';
    
    -- Poner CITIO en 0
    UPDATE warehouse_stock 
    SET current_stock = 0, updated_at = NOW()
    WHERE product_id = r.product_id 
    AND warehouse_id = 'd36d1b4e-8c68-4946-bb1b-86126805a3d6';
  END LOOP;
END $$;