-- Fix quote_items where importe includes IVA (imported from Excel CIPI)
-- Set importe = precio_unitario * cantidad and tipo_precio = 'manual'
UPDATE public.quote_items
SET 
  importe = precio_unitario * cantidad,
  tipo_precio = 'manual'
WHERE ABS(importe - (precio_unitario * cantidad)) > 0.01;