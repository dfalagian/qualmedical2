-- Agregar índice único para prevenir facturas duplicadas por proveedor y UUID
-- Esto bloquea a nivel de base de datos cualquier intento de insertar una factura con el mismo UUID para el mismo proveedor
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_supplier_uuid_unique 
ON public.invoices (supplier_id, uuid) 
WHERE uuid IS NOT NULL;