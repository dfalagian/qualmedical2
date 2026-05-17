-- RPC atómica para ingreso de productos al inventario.
-- Reemplaza el bucle JS de ProductEntryDialog que en caso de error parcial
-- inflaba stock al reintentar (incidente OC QUAL2026-066: 7× duplicación lote 0250096A).
--
-- Garantías:
--  1. TODO o NADA: cualquier excepción hace ROLLBACK total (PL/pgSQL transaccional).
--  2. Idempotencia: si ya existen movimientos para el mismo _operation_id, aborta.
--  3. Compensación de doble-conteo: el trigger sync_stock_from_batch_warehouse
--     ya actualiza products.current_stock al modificar batch_warehouse_stock;
--     el trigger update_product_stock SUMA otra vez en INSERT a inventory_movements
--     (movement_type='entrada'). Por eso pre-restamos antes del INSERT del movimiento,
--     mismo patrón que approve_quote_atomic usa en sentido inverso.

CREATE OR REPLACE FUNCTION public.ingress_product_atomic(
  _operation_id uuid,
  _warehouse_id uuid,
  _purchase_order_id uuid,
  _invoice_number text,
  _entry_date timestamptz,
  _items jsonb,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _product_id uuid;
  _batch_id uuid;
  _batch_number text;
  _barcode text;
  _expiration_date date;
  _cantidad integer;
  _is_existing boolean;
  _existing_batch record;
  _new_batch_id uuid;
  _bws_id uuid;
  _bws_qty integer;
  _po_item record;
  _existing_movs integer;
  _items_processed integer := 0;
  _movement_note text;
BEGIN
  -- Permisos: admin, contador o inventario_rfid (los mismos que ya pueden insertar movimientos)
  IF NOT (public.is_admin(_user_id)
          OR public.is_contador(_user_id)
          OR public.is_inventario_rfid(_user_id)) THEN
    RAISE EXCEPTION 'No tienes permisos para registrar ingresos de inventario'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _operation_id IS NULL THEN
    RAISE EXCEPTION '_operation_id es obligatorio para garantizar idempotencia'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'No hay items para procesar'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- BLINDAJE: idempotencia. Si ya hay movimientos con este operation_id, abortar.
  -- El operation_id se incrusta en notes con prefijo "[OP:<uuid>]".
  SELECT COUNT(*) INTO _existing_movs
  FROM inventory_movements
  WHERE notes LIKE '[OP:' || _operation_id::text || ']%';

  IF _existing_movs > 0 THEN
    RAISE EXCEPTION 'Esta operación ya fue procesada previamente (% movimientos ya registrados con operation_id %). El reintento se canceló para no duplicar stock.', _existing_movs, _operation_id
      USING ERRCODE = 'unique_violation';
  END IF;

  -- PROCESAR cada item
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _product_id     := (_item->>'product_id')::uuid;
    _batch_id       := NULLIF(_item->>'batch_id', '')::uuid;
    _batch_number   := _item->>'batch_number';
    _barcode        := _item->>'barcode';
    _expiration_date:= NULLIF(_item->>'expiration_date', '')::date;
    _cantidad       := (_item->>'cantidad')::integer;
    _is_existing    := COALESCE((_item->>'is_existing_batch')::boolean, false);

    IF _product_id IS NULL OR _cantidad IS NULL OR _cantidad <= 0 THEN
      RAISE EXCEPTION 'Item inválido: product_id=%, cantidad=%', _product_id, _cantidad;
    END IF;

    -- 1) Resolver / crear el lote
    IF _is_existing AND _batch_id IS NOT NULL THEN
      -- Lote existente: sumar cantidades
      UPDATE product_batches
      SET current_quantity = current_quantity + _cantidad,
          initial_quantity = initial_quantity + _cantidad
      WHERE id = _batch_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lote existente no encontrado: %', _batch_id;
      END IF;
    ELSE
      -- Verificar si existe lote por (product_id, batch_number) — captura colisiones manuales
      SELECT id, current_quantity, initial_quantity
      INTO _existing_batch
      FROM product_batches
      WHERE product_id = _product_id AND batch_number = _batch_number
      LIMIT 1;

      IF _existing_batch.id IS NOT NULL THEN
        UPDATE product_batches
        SET current_quantity = _existing_batch.current_quantity + _cantidad,
            initial_quantity = _existing_batch.initial_quantity + _cantidad
        WHERE id = _existing_batch.id;
        _batch_id := _existing_batch.id;
      ELSE
        -- Crear lote nuevo
        IF _batch_number IS NULL OR _expiration_date IS NULL OR _barcode IS NULL THEN
          RAISE EXCEPTION 'Datos incompletos para crear lote: producto %, lote=%, caducidad=%, barcode=%',
            _product_id, _batch_number, _expiration_date, _barcode;
        END IF;

        INSERT INTO product_batches (
          product_id, batch_number, barcode, expiration_date,
          initial_quantity, current_quantity, notes
        ) VALUES (
          _product_id, _batch_number, _barcode, _expiration_date,
          _cantidad, _cantidad,
          CASE WHEN _invoice_number IS NOT NULL AND _invoice_number <> ''
               THEN 'Factura: ' || _invoice_number ELSE NULL END
        )
        RETURNING id INTO _new_batch_id;

        _batch_id := _new_batch_id;
      END IF;
    END IF;

    -- 2) Actualizar warehouse_id del producto al almacén de ingreso
    IF _warehouse_id IS NOT NULL THEN
      UPDATE products SET warehouse_id = _warehouse_id WHERE id = _product_id;
    END IF;

    -- 3) Sumar/insertar batch_warehouse_stock (SSOT — el trigger sincroniza el resto)
    IF _warehouse_id IS NOT NULL THEN
      SELECT id, quantity INTO _bws_id, _bws_qty
      FROM batch_warehouse_stock
      WHERE batch_id = _batch_id AND warehouse_id = _warehouse_id;

      IF _bws_id IS NOT NULL THEN
        UPDATE batch_warehouse_stock
        SET quantity = _bws_qty + _cantidad, updated_at = now()
        WHERE id = _bws_id;
      ELSE
        INSERT INTO batch_warehouse_stock (batch_id, warehouse_id, quantity)
        VALUES (_batch_id, _warehouse_id, _cantidad);
      END IF;
    END IF;

    -- 4) Compensar doble suma del trigger update_product_stock
    --    (en INSERT a inventory_movements con type='entrada' SUMA quantity a current_stock,
    --     pero ya lo sumó el trigger sync_stock_from_batch_warehouse arriba).
    UPDATE products
    SET current_stock = current_stock - _cantidad
    WHERE id = _product_id;

    -- 5) Insertar movimiento de inventario (con marca [OP:<uuid>] para idempotencia)
    _movement_note := '[OP:' || _operation_id::text || '] ' ||
      CASE WHEN _invoice_number IS NOT NULL AND _invoice_number <> ''
           THEN 'Factura: ' || _invoice_number
           ELSE 'Ingreso de producto - Lote: ' || COALESCE(_batch_number, '') END;

    INSERT INTO inventory_movements (
      product_id, batch_id, movement_type, quantity,
      reference_type, reference_id, location, notes, created_by, created_at
    ) VALUES (
      _product_id, _batch_id, 'entrada', _cantidad,
      CASE WHEN _purchase_order_id IS NOT NULL THEN 'purchase_order' ELSE NULL END,
      _purchase_order_id,
      _warehouse_id::text,
      _movement_note,
      _user_id,
      COALESCE(_entry_date, now())
    );

    -- 6) Actualizar quantity_received en purchase_order_items (si hay OC vinculada)
    IF _purchase_order_id IS NOT NULL THEN
      SELECT id, quantity_received INTO _po_item
      FROM purchase_order_items
      WHERE purchase_order_id = _purchase_order_id AND product_id = _product_id
      LIMIT 1;

      IF _po_item.id IS NOT NULL THEN
        UPDATE purchase_order_items
        SET quantity_received = COALESCE(_po_item.quantity_received, 0) + _cantidad
        WHERE id = _po_item.id;
      END IF;
    END IF;

    _items_processed := _items_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', _operation_id,
    'items_processed', _items_processed
  );
END;
$function$;

-- Permitir llamar la función a roles autenticados (RLS interna controla permisos vía has_role)
GRANT EXECUTE ON FUNCTION public.ingress_product_atomic(uuid, uuid, uuid, text, timestamptz, jsonb, uuid) TO authenticated;
