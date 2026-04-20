
CREATE OR REPLACE FUNCTION public.sync_stock_from_batch_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _batch_id uuid;
  _warehouse_id uuid;
  _product_id uuid;
  _new_batch_qty integer;
  _new_wh_qty integer;
  _new_product_qty integer;
BEGIN
  -- Determine affected batch_id and warehouse_id
  IF TG_OP = 'DELETE' THEN
    _batch_id := OLD.batch_id;
    _warehouse_id := OLD.warehouse_id;
  ELSE
    _batch_id := NEW.batch_id;
    _warehouse_id := NEW.warehouse_id;
  END IF;

  -- Get the product_id for the current batch
  SELECT pb.product_id INTO _product_id FROM product_batches pb WHERE pb.id = _batch_id;

  -- Handle old batch/warehouse on UPDATE if they changed
  IF TG_OP = 'UPDATE' AND OLD.batch_id IS DISTINCT FROM NEW.batch_id THEN
    SELECT COALESCE(SUM(quantity), 0) INTO _new_batch_qty
    FROM batch_warehouse_stock WHERE batch_id = OLD.batch_id;
    UPDATE product_batches SET current_quantity = _new_batch_qty WHERE id = OLD.batch_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id THEN
    SELECT COALESCE(SUM(bws.quantity), 0) INTO _new_wh_qty
    FROM batch_warehouse_stock bws
    JOIN product_batches pb ON pb.id = bws.batch_id
    WHERE pb.product_id = _product_id AND bws.warehouse_id = OLD.warehouse_id;

    INSERT INTO warehouse_stock (product_id, warehouse_id, current_stock)
    VALUES (_product_id, OLD.warehouse_id, _new_wh_qty)
    ON CONFLICT (product_id, warehouse_id) 
    DO UPDATE SET current_stock = _new_wh_qty, updated_at = now();
  END IF;

  -- 1. Sync product_batches.current_quantity
  SELECT COALESCE(SUM(quantity), 0) INTO _new_batch_qty
  FROM batch_warehouse_stock WHERE batch_id = _batch_id;
  UPDATE product_batches SET current_quantity = _new_batch_qty WHERE id = _batch_id;

  -- 2. Sync warehouse_stock
  SELECT COALESCE(SUM(bws.quantity), 0) INTO _new_wh_qty
  FROM batch_warehouse_stock bws
  JOIN product_batches pb ON pb.id = bws.batch_id
  WHERE pb.product_id = _product_id AND bws.warehouse_id = _warehouse_id;

  INSERT INTO warehouse_stock (product_id, warehouse_id, current_stock)
  VALUES (_product_id, _warehouse_id, _new_wh_qty)
  ON CONFLICT (product_id, warehouse_id) 
  DO UPDATE SET current_stock = _new_wh_qty, updated_at = now();

  -- 3. Sync products.current_stock = sum of ALL active batches for this product
  SELECT COALESCE(SUM(pb.current_quantity), 0) INTO _new_product_qty
  FROM product_batches pb
  WHERE pb.product_id = _product_id AND pb.is_active = true;

  UPDATE products SET current_stock = _new_product_qty WHERE id = _product_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
