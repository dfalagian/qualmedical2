-- Agregar campo barcode a la tabla products para almacenar el código de barras original
-- El SKU ahora será el identificador único: barcode-QUAL-0001

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS barcode text;

-- Comentario para documentar el cambio
COMMENT ON COLUMN public.products.barcode IS 'Código de barras del medicamento (puede repetirse entre proveedores)';
COMMENT ON COLUMN public.products.sku IS 'Identificador único: barcode-QUAL-XXXX donde XXXX es un número secuencial';