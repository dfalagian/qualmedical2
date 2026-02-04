-- Add 4 price type columns to products table (5th type is manual at quote creation)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS price_type_1 numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS price_type_2 numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS price_type_3 numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS price_type_4 numeric DEFAULT NULL;

-- Add comments to describe the price types
COMMENT ON COLUMN public.products.price_type_1 IS 'Precio Tipo 1 - Público';
COMMENT ON COLUMN public.products.price_type_2 IS 'Precio Tipo 2 - Mayoreo';
COMMENT ON COLUMN public.products.price_type_3 IS 'Precio Tipo 3 - Distribuidor';
COMMENT ON COLUMN public.products.price_type_4 IS 'Precio Tipo 4 - Especial';