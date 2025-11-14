-- Forzar regeneración de tipos de la tabla profiles
-- Eliminar y recrear la columna approved para forzar actualización de tipos
ALTER TABLE public.profiles DROP COLUMN IF EXISTS approved;
ALTER TABLE public.profiles ADD COLUMN approved boolean NOT NULL DEFAULT false;

-- Agregar comentario descriptivo
COMMENT ON COLUMN public.profiles.approved IS 'Indica si el proveedor ha completado y aprobado todos los documentos requeridos (INE, Constancia Fiscal, Comprobante de Domicilio, Datos Bancarios)';