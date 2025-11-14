-- Agregar campo de aprobación de proveedores
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false;

COMMENT ON COLUMN profiles.approved IS 'Indica si el proveedor ha sido aprobado por un administrador para operar en el sistema';

-- Índice para búsquedas eficientes de proveedores aprobados
CREATE INDEX IF NOT EXISTS idx_profiles_approved ON profiles(approved);