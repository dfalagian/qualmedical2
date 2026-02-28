-- Revertir UNA aplicación duplicada de la transferencia grupo 161ccf8d-0ae8-4d6b-a431-0e31b6c7ce58
-- Restar cantidades de Almacén CITIO (d36d1b4e-8c68-4946-bb1b-86126805a3d6)
-- Sumar cantidades de vuelta a Almacén Principal (eccd60f4-3538-4594-bdd1-6897bfdfe8d8)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT product_id, SUM(quantity) as qty
    FROM warehouse_transfers 
    WHERE transfer_group_id = '161ccf8d-0ae8-4d6b-a431-0e31b6c7ce58'
    GROUP BY product_id
  LOOP
    -- Restar de CITIO
    UPDATE warehouse_stock 
    SET current_stock = current_stock - r.qty, updated_at = NOW()
    WHERE product_id = r.product_id 
    AND warehouse_id = 'd36d1b4e-8c68-4946-bb1b-86126805a3d6';
    
    -- Sumar a Principal
    UPDATE warehouse_stock 
    SET current_stock = current_stock + r.qty, updated_at = NOW()
    WHERE product_id = r.product_id 
    AND warehouse_id = 'eccd60f4-3538-4594-bdd1-6897bfdfe8d8';
  END LOOP;
END $$;