-- Agregar campo para motivo de rechazo de facturas
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS rejection_reason text;