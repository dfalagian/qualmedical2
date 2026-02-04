-- Agregar campo grupo_sat a la tabla products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS grupo_sat TEXT;

-- Agregar índice para búsquedas por grupo_sat
CREATE INDEX IF NOT EXISTS idx_products_grupo_sat ON public.products(grupo_sat);

-- Comentario descriptivo
COMMENT ON COLUMN public.products.grupo_sat IS 'Grupo SAT del producto importado desde CITIO';