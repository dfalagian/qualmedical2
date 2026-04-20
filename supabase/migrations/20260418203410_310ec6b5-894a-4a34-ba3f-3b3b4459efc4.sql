DO $$
DECLARE
  _quote_id uuid := 'f5591819-02a4-4446-8fea-4c92959b3d11';
  _row record;
BEGIN
  FOR _row IN
    SELECT batch_id, location::uuid AS warehouse_id, SUM(quantity)::int AS total_qty
    FROM inventory_movements
    WHERE reference_id = _quote_id
      AND reference_type = 'venta'
      AND movement_type = 'salida'
      AND batch_id IS NOT NULL
      AND location IS NOT NULL
    GROUP BY batch_id, location
  LOOP
    INSERT INTO batch_warehouse_stock (batch_id, warehouse_id, quantity)
    VALUES (_row.batch_id, _row.warehouse_id, _row.total_qty)
    ON CONFLICT (batch_id, warehouse_id)
    DO UPDATE SET quantity = batch_warehouse_stock.quantity + _row.total_qty,
                  updated_at = now();
  END LOOP;

  DELETE FROM inventory_movements
  WHERE reference_id = _quote_id
    AND reference_type = 'venta'
    AND movement_type = 'salida';
END $$;