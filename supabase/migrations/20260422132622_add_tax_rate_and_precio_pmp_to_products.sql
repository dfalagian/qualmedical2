-- Agregar columnas tax_rate y precio_pmp a la tabla products
-- tax_rate: tasa de IVA aplicada al producto (0, 8 o 16)
-- precio_pmp: precio medio ponderado del producto

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tax_rate integer NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS precio_pmp numeric DEFAULT 0;
