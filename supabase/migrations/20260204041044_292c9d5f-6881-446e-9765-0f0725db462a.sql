-- Add tipo_precio column to quote_items table to store the selected price type
ALTER TABLE public.quote_items 
ADD COLUMN tipo_precio text DEFAULT '1';

-- Add comment explaining the field
COMMENT ON COLUMN public.quote_items.tipo_precio IS 'Price type: 1=Público, 2=Mayoreo, 3=Distribuidor, 4=Especial, manual=Precio manual';