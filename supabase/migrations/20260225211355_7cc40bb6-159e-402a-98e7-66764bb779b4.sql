
UPDATE quote_items 
SET is_sub_product = false, parent_item_id = NULL 
WHERE quote_id = '05b3e8ba-7871-45bc-b1e4-d7416652c3fe' 
  AND parent_item_id = 'b7bfd6a4-cf7e-4d9b-a649-60eba4c08afb';

DELETE FROM quote_items 
WHERE id = 'b7bfd6a4-cf7e-4d9b-a649-60eba4c08afb';

UPDATE quotes SET
  subtotal = (SELECT COALESCE(SUM(importe), 0) FROM quote_items WHERE quote_id = '05b3e8ba-7871-45bc-b1e4-d7416652c3fe'),
  total = (SELECT COALESCE(SUM(importe), 0) FROM quote_items WHERE quote_id = '05b3e8ba-7871-45bc-b1e4-d7416652c3fe'),
  updated_at = now()
WHERE id = '05b3e8ba-7871-45bc-b1e4-d7416652c3fe';
