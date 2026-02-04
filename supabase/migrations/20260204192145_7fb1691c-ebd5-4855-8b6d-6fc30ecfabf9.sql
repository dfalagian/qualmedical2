-- Agregar campos adicionales para sincronización con CITIO
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS codigo_sat text,
ADD COLUMN IF NOT EXISTS clave_unidad text,
ADD COLUMN IF NOT EXISTS price_type_5 numeric,
ADD COLUMN IF NOT EXISTS price_with_tax numeric,
ADD COLUMN IF NOT EXISTS price_without_tax numeric,
ADD COLUMN IF NOT EXISTS tax_rate numeric;