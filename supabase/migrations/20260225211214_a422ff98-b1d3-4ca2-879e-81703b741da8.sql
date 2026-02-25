
DO $$
DECLARE
  v_quote_id uuid := '05b3e8ba-7871-45bc-b1e4-d7416652c3fe';
  v_old_parent_id uuid;
  v_parent_id uuid;
BEGIN
  -- Get the old parent id
  SELECT id INTO v_old_parent_id FROM quote_items 
  WHERE quote_id = v_quote_id AND nombre_producto ILIKE '%PREPARACION%' AND is_sub_product = false
  LIMIT 1;

  -- Delete old sub-products and parent
  IF v_old_parent_id IS NOT NULL THEN
    DELETE FROM quote_items WHERE quote_id = v_quote_id AND parent_item_id = v_old_parent_id;
    DELETE FROM quote_items WHERE id = v_old_parent_id;
  END IF;

  -- Insert new PREPARACION parent (using price_type_1 from CITIO: 1740)
  INSERT INTO quote_items (quote_id, product_id, nombre_producto, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, NULL, 'PREPARACION DE MEDICAMENTO (ONCOLOGICO Y/O INMUNOTERAPIA) 1.3', 1, 1740.00, 1740.00, false, '1')
  RETURNING id INTO v_parent_id;

  -- Insert all 22 sub-products with correct local product_ids and prices from CITIO
  -- 1. BANDAS ADHESIVAS CIRCULARES 22MM.
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, 'c64d2e77-8b03-413e-b3a3-d964f66b47b3', v_parent_id, 'BANDAS ADHESIVAS CIRCULARES 22MM.', 'PROTEC', 2, 0.70, 1.40, true, '1');

  -- 2. GASA ESTERIL 10x10 CM
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '0a72076f-17e3-4d4e-a54a-5e16e749a754', v_parent_id, 'GASA ESTERIL 10x10 CM', 'DIBAR', 8, 9.28, 74.24, true, '1');

  -- 3. APOSITO TRANSPARENTE ESTERIL 10CM X 12CM.
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '6fa1c359-6458-4e83-ba9a-eb21274abc59', v_parent_id, 'APOSITO TRANSPARENTE ESTERIL 10CM X 12CM.', 'TEGADERM-FILM', 1, 2.55, 2.55, true, '1');

  -- 4. GUANTE DE LATEX MEDIANO ESTERIL
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '5fee82d3-867f-41ec-b9f2-785b1d69f08c', v_parent_id, 'GUANTE DE LATEX MEDIANO ESTERIL', 'AMBIDERM', 8, 1.44, 11.52, true, '1');

  -- 5. CLORURO DE SODIO 0.9% 50 ML.
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, 'abfb6ec8-5c65-4bfd-b29d-ccd617c33984', v_parent_id, 'CLORURO DE SODIO 0.9% 50 ML.', 'SOLUCION CS PISA', 1, 20.00, 20.00, true, '1');

  -- 6. JERINGA DESECHABLE 10 ML C/AGUJA 20x38 MM
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '34d48d5e-9b05-4fcd-a979-350eae489629', v_parent_id, 'JERINGA DESECHABLE 10 ML C/AGUJA 20x38 MM', 'DL', 6, 3.27, 19.62, true, '1');

  -- 7. CLORURO DE SODIO 0.9% 100 ML.
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, 'f847547d-a11f-4e2d-9b25-da2cc15914c2', v_parent_id, 'CLORURO DE SODIO 0.9% 100 ML.', 'SOLUCION CS PISA', 2, 19.80, 39.60, true, '1');

  -- 8. AGUJA HIPODERMICA 18G X 1 1/2" ROSA
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '2269c68b-8102-4aa1-b2b4-894f166d905f', v_parent_id, 'AGUJA HIPODERMICA 18G X 1 1/2" ROSA', 'BD', 10, 2.3432, 23.432, true, '1');

  -- 9. GUANTE DE NITRILO MEDIANO NO ESTERIL
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '99ff9586-92f0-4eeb-9e92-eb55807bb6c3', v_parent_id, 'GUANTE DE NITRILO MEDIANO NO ESTERIL', 'AMBIDERM', 2, 1.43, 2.86, true, '1');

  -- 10. TOALLITAS DE ALCOHOL INDIVIDUALES
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, 'cf31a810-fd05-4aab-b5bb-9186d2283f57', v_parent_id, 'TOALLITAS DE ALCOHOL INDIVIDUALES', 'PROTEC', 10, 0.80, 8.00, true, '1');

  -- 11. JERINGA DESECHABLE 20 ML S/AGUJA
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '7561e88e-96e9-4758-919a-ef9dcf74d4de', v_parent_id, 'JERINGA DESECHABLE 20 ML S/AGUJA', 'DL', 4, 4.56, 18.24, true, '1');

  -- 12. CLORURO DE SODIO 0.9% 250 ML.
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '7b8c3ab2-4fad-4426-a514-12e838c67022', v_parent_id, 'CLORURO DE SODIO 0.9% 250 ML.', 'SOLUCION CS PISA', 2, 22.77, 45.54, true, '1');

  -- 13. AGUJA 20G X 19MM C/EXT LUER LOCK
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '9b79c086-b258-49bb-991b-ae26116fd490', v_parent_id, 'AGUJA 20G X 19MM C/EXT LUER LOCK', 'PORT-A-SITE', 1, 23.20, 23.20, true, '1');

  -- 14. BATA ESTERIL PARA CIRUJANO DESECHABLE
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '3d3596bc-1b4a-4403-a3cf-3dd3203da788', v_parent_id, 'BATA ESTERIL PARA CIRUJANO DESECHABLE', NULL, 1, 100.00, 100.00, true, '1');

  -- 15. BOTA DESECHABLE PAR
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '759efdc4-b68d-441c-b196-b1e293a23b17', v_parent_id, 'BOTA DESECHABLE PAR', 'PROTEC', 1, 5.43, 5.43, true, '1');

  -- 16. GLUCOSA 5% 250 ML.
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, 'fcff5c15-eda9-45b6-a47c-c896a1414f4e', v_parent_id, 'GLUCOSA 5% 250 ML.', 'SOLUCION DX-5 PISA', 2, 25.00, 50.00, true, '1');

  -- 17. GLUCOSA 5% 100 ML.
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '860e1e81-97a6-49c2-bb23-3ab01ce86f9b', v_parent_id, 'GLUCOSA 5% 100 ML.', 'SOLUCION DX-5 PISA', 2, 26.00, 52.00, true, '1');

  -- 18. EQUIPO SECUNDARIO CON FILTRO 15 MICRAS
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '37d9ec77-0847-468b-be50-867ffef0496f', v_parent_id, 'EQUIPO SECUNDARIO CON FILTRO 15 MICRAS', 'ICU MEDICAL', 2, 92.8464, 185.6928, true, '1');

  -- 19. BOMBA ELASTOMERICA 270ML. 5 ML/ HL
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '598939bf-88c3-4822-9374-904d28628d8e', v_parent_id, 'BOMBA ELASTOMERICA  270ML. 5 ML/ HL', 'HOMEPUM C-SERIES', 1, 2088.00, 2088.00, true, '1');

  -- 20. CAMPO QUIRURGICO CON ADHESIVO 60 X 40 CM
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '170e8353-3d62-4a91-9e81-b349f29d30bb', v_parent_id, 'CAMPO QUIRURGICO CON ADHESIVO 60 X 40 CM', NULL, 2, 31.40, 62.80, true, '1');

  -- 21. GORRO PARA CIRUJANO DESECHABLE
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, '975491d5-b65f-4333-9d35-9ad3e61327aa', v_parent_id, 'GORRO PARA CIRUJANO DESECHABLE', NULL, 1, 17.40, 17.40, true, '1');

  -- 22. EQUIPO PRIMARIO PLUM C/ FILTRO 0.15 MICRAS
  INSERT INTO quote_items (quote_id, product_id, parent_item_id, nombre_producto, marca, cantidad, precio_unitario, importe, is_sub_product, tipo_precio)
  VALUES (v_quote_id, 'dab00eb9-1cbe-46a6-8d95-db7ed949c0a2', v_parent_id, 'EQUIPO PRIMARIO PLUM C/ FILTRO 0.15 MICRAS', 'ICU MEDICAL', 1, 412.17, 412.17, true, '1');

  -- Update quote totals
  UPDATE quotes SET
    subtotal = (SELECT COALESCE(SUM(importe), 0) FROM quote_items WHERE quote_id = v_quote_id),
    total = (SELECT COALESCE(SUM(importe), 0) FROM quote_items WHERE quote_id = v_quote_id),
    updated_at = now()
  WHERE id = v_quote_id;
END $$;
