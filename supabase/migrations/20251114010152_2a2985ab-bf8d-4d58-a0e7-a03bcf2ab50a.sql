-- Agregar campo para impuestos detallados en facturas
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS impuestos_detalle JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN invoices.impuestos_detalle IS 'Detalle completo de impuestos: traslados (IVA, IEPS) y retenciones (ISR)';