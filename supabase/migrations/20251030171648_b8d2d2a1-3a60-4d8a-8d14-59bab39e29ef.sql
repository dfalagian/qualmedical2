-- Agregar campos nuevos a la tabla pagos
ALTER TABLE public.pagos 
ADD COLUMN IF NOT EXISTS nombre_banco text,
ADD COLUMN IF NOT EXISTS comprobante_pago_url text,
ADD COLUMN IF NOT EXISTS fecha_pago date;

-- Agregar campo nombre_banco a la tabla documents para documentos de datos bancarios
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS nombre_banco text;

-- Actualizar RLS para permitir actualizar comprobantes de pago
-- Los admins ya pueden actualizar pagos, así que no necesitamos cambiar las políticas