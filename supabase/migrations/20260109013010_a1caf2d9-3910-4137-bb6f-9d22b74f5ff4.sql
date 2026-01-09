-- Add citio_id column to products table to link with external CITIO catalog
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS citio_id TEXT UNIQUE;

-- Add index for faster lookups by citio_id
CREATE INDEX IF NOT EXISTS idx_products_citio_id ON public.products(citio_id);

-- Add comment explaining the column
COMMENT ON COLUMN public.products.citio_id IS 'External CITIO medication catalog ID for linked products';