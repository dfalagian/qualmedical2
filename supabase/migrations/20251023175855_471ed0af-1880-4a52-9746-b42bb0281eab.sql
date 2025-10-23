-- Agregar columnas para gestionar complementos de pago
ALTER TABLE invoices 
ADD COLUMN requiere_complemento boolean DEFAULT false,
ADD COLUMN complemento_pago_url text DEFAULT NULL;