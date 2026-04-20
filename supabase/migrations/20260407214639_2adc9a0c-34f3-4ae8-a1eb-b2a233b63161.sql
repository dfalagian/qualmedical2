UPDATE products
SET sku = regexp_replace(sku, '-QUAL-[0-9]+$', '')
WHERE sku ~ '-QUAL-[0-9]+$'
  AND id NOT IN (
    '6a8db5a9-bd58-45aa-89c3-dac2f5127a29',
    '50d858c3-6579-403c-b46d-336deb4d2a6b'
  );