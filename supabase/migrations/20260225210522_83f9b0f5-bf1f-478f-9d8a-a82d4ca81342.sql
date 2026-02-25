DO $$
DECLARE
  v_quote_id uuid := '05b3e8ba-7871-45bc-b1e4-d7416652c3fe';
  v_parent_id uuid;
BEGIN
  -- Solo insertar si no existe ya un item de preparación para evitar duplicados si se corre dos veces
  IF NOT EXISTS (SELECT 1 FROM quote_items WHERE quote_id = v_quote_id AND nombre_producto ILIKE '%PREPARACION%') THEN
      -- 1. Insertar Padre (Preparación)
      INSERT INTO quote_items (quote_id, product_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
      VALUES (v_quote_id, NULL, 'PREPARACION DE MEDICAMENTO (ONCOLOGICO Y/O INMUNOTERAPIA) 1.3', 1, 1515.17, 1515.17, false, '1')
      RETURNING id INTO v_parent_id;

      -- 2. Insertar Insumos (Hijos)
      -- Equipo Primario
      INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
      VALUES (v_quote_id, 'fb14c1b9-9a76-4421-ad68-bd2b2b5ba2d2', v_parent_id, 'EQUIPO PRIMARIO C/ FILTRO 22 MICRAS FOTOPROTECTOR', 1, 433.55, 433.55, true, '1');

      -- Equipo Secundario
      INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
      VALUES (v_quote_id, '37d9ec77-0847-468b-be50-867ffef0496f', v_parent_id, 'EQUIPO SECUNDARIO CON FILTRO 15 MICRAS', 1, 92.85, 92.85, true, '1');

      -- Agujas
      INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
      VALUES (v_quote_id, '2269c68b-8102-4aa1-b2b4-894f166d905f', v_parent_id, 'AGUJA HIPODERMICA 18G X 1 1/2" ROSA', 5, 2.34, 11.70, true, '1');

      -- Jeringas 20ml
      INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
      VALUES (v_quote_id, '7561e88e-96e9-4758-919a-ef9dcf74d4de', v_parent_id, 'JERINGA DESECHABLE 20 ML S/AGUJA', 2, 4.56, 9.12, true, '1');
      
      -- Cloruro 250ml
      INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
      VALUES (v_quote_id, '7b8c3ab2-4fad-4426-a514-12e838c67022', v_parent_id, 'CLORURO DE SODIO 0.9% 250 ML.', 1, 22.77, 22.77, true, '1');

      -- Cloruro 50ml
      INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
      VALUES (v_quote_id, 'abfb6ec8-5c65-4bfd-b29d-ccd617c33984', v_parent_id, 'CLORURO DE SODIO 0.9% 50 ML.', 1, 20.00, 20.00, true, '1');
  END IF;
END $$;