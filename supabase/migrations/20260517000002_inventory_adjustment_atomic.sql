-- RPC atómica para ajustes de inventario (entradas y salidas manuales).
-- Reemplaza el bucle JS de InventoryMovementModal que causaba doble-conteo:
--   trigger sync_stock_from_batch_warehouse (en batch_warehouse_stock) +
--   trigger update_product_stock (en inventory_movements) = stock sumado dos veces.
--
-- Patrón de compensación idéntico al de ingress_product_atomic:
--   1. UPDATE/INSERT batch_warehouse_stock  → trigger 1 ajusta current_stock
--   2. UPDATE products current_stock -delta  → compensación (deshace trigger 1)
--   3. INSERT inventory_movements           → trigger 2 aplica delta una vez más
--   Neto: delta aplicado exactamente una vez.
--
-- La función es transaccional (PL/pgSQL): cualquier excepción hace ROLLBACK total.

CREATE OR REPLACE FUNCTION public.inventory_adjustment_atomic(
  _items jsonb,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item                  jsonb;
  _product_id            uuid;
  _batch_stock_id        uuid;
  _movement_code         text;
  _qty                   integer;
  _notes                 text;
  _new_batch_number      text;
  _new_batch_expiration  date;
  _new_batch_wh_id       uuid;
  _direction             char(1);
  _is_exit               boolean;
  _movement_type         text;
  _bs_quantity           integer;
  _bs_batch_id           uuid;
  _bs_warehouse_id       uuid;
  _new_qty               integer;
  _batch_id              uuid;
  _items_processed       integer := 0;
BEGIN
  IF NOT (public.is_admin(_user_id)
          OR public.is_contador(_user_id)
          OR public.is_inventario_rfid(_user_id)) THEN
    RAISE EXCEPTION 'No tienes permisos para registrar movimientos de inventario'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'No hay items para procesar'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _product_id           := (_item->>'product_id')::uuid;
    _batch_stock_id       := NULLIF(_item->>'batch_stock_id', '')::uuid;
    _movement_code        := _item->>'movement_code';
    _qty                  := (_item->>'quantity')::integer;
    _notes                := NULLIF(_item->>'notes', '');
    _new_batch_number     := NULLIF(_item->>'new_batch_number', '');
    _new_batch_expiration := NULLIF(_item->>'new_batch_expiration', '')::date;
    _new_batch_wh_id      := NULLIF(_item->>'new_batch_warehouse_id', '')::uuid;

    IF _product_id IS NULL OR _qty IS NULL OR _qty <= 0 THEN
      RAISE EXCEPTION 'Item inválido: product_id=%, quantity=%', _product_id, _qty;
    END IF;

    -- Obtener dirección del tipo de movimiento desde la BD (autoridad)
    SELECT direction INTO _direction
    FROM inventory_movement_types
    WHERE code = _movement_code AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tipo de movimiento desconocido o inactivo: %', _movement_code;
    END IF;

    _is_exit       := (_direction = 'S');
    _movement_type := CASE WHEN _is_exit THEN 'salida' ELSE 'entrada' END;

    IF _batch_stock_id IS NOT NULL THEN
      -- ── LOTE EXISTENTE ────────────────────────────────────────────────────

      SELECT quantity, batch_id, warehouse_id
      INTO _bs_quantity, _bs_batch_id, _bs_warehouse_id
      FROM batch_warehouse_stock
      WHERE id = _batch_stock_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro de stock de lote no encontrado: %', _batch_stock_id;
      END IF;

      _new_qty := CASE WHEN _is_exit THEN _bs_quantity - _qty ELSE _bs_quantity + _qty END;

      IF _is_exit AND _new_qty < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', _bs_quantity, _qty;
      END IF;

      -- 1. Actualizar BWS (trigger 1 → ajusta current_stock)
      UPDATE batch_warehouse_stock
      SET quantity = _new_qty, updated_at = now()
      WHERE id = _batch_stock_id;

      -- 2. Compensar: deshacer lo que aplicó trigger 1 (para que trigger 2 lo aplique solo)
      UPDATE products
      SET current_stock = current_stock + (CASE WHEN _is_exit THEN _qty ELSE -_qty END)
      WHERE id = _product_id;

      -- 3. Insertar movimiento (trigger 2 → aplica delta definitivamente)
      INSERT INTO inventory_movements (
        product_id, batch_id, movement_type, quantity,
        previous_stock, new_stock, reference_type, location, notes, created_by
      ) VALUES (
        _product_id, _bs_batch_id, _movement_type, _qty,
        _bs_quantity, _new_qty, _movement_code, _bs_warehouse_id::text, _notes, _user_id
      );

    ELSE
      -- ── LOTE NUEVO (solo entradas; las salidas sin lote son bloqueadas en frontend) ──

      IF _is_exit THEN
        RAISE EXCEPTION 'No se puede registrar salida sin lote/stock existente';
      END IF;
      IF _new_batch_number IS NULL THEN
        RAISE EXCEPTION 'Se requiere número de lote para crear nuevo lote';
      END IF;
      IF _new_batch_wh_id IS NULL THEN
        RAISE EXCEPTION 'Se requiere almacén para crear nuevo lote';
      END IF;

      -- Crear lote (cantidad inicial = 0; BWS es la SSOT)
      INSERT INTO product_batches (
        product_id, batch_number, expiration_date, barcode,
        initial_quantity, current_quantity
      ) VALUES (
        _product_id, _new_batch_number, _new_batch_expiration, '',
        0, 0
      )
      RETURNING id INTO _batch_id;

      -- 1. Crear BWS con la cantidad (trigger 1 → suma +qty a current_stock)
      INSERT INTO batch_warehouse_stock (batch_id, warehouse_id, quantity)
      VALUES (_batch_id, _new_batch_wh_id, _qty);

      -- 2. Compensar: restar qty antes de que trigger 2 lo sume de nuevo
      UPDATE products
      SET current_stock = current_stock - _qty
      WHERE id = _product_id;

      -- 3. Insertar movimiento (trigger 2 → suma +qty definitivamente)
      INSERT INTO inventory_movements (
        product_id, batch_id, movement_type, quantity,
        previous_stock, new_stock, reference_type, location, notes, created_by
      ) VALUES (
        _product_id, _batch_id, 'entrada', _qty,
        0, _qty, _movement_code, _new_batch_wh_id::text, _notes, _user_id
      );
    END IF;

    _items_processed := _items_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'items_processed', _items_processed
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.inventory_adjustment_atomic(jsonb, uuid) TO authenticated;
