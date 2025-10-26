-- Crear tabla para registros de conteo de medicamentos
CREATE TABLE public.medicine_counts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL,
  analysis TEXT,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT
);

-- Habilitar RLS
ALTER TABLE public.medicine_counts ENABLE ROW LEVEL SECURITY;

-- Los proveedores pueden ver sus propios registros
CREATE POLICY "Los proveedores pueden ver sus propios registros de conteo"
ON public.medicine_counts
FOR SELECT
USING (auth.uid() = supplier_id);

-- Los admins pueden ver todos los registros
CREATE POLICY "Los admins pueden ver todos los registros de conteo"
ON public.medicine_counts
FOR SELECT
USING (is_admin(auth.uid()));

-- Los admins pueden insertar registros
CREATE POLICY "Los admins pueden insertar registros de conteo"
ON public.medicine_counts
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Los admins pueden actualizar registros
CREATE POLICY "Los admins pueden actualizar registros de conteo"
ON public.medicine_counts
FOR UPDATE
USING (is_admin(auth.uid()));

-- Los admins pueden eliminar registros
CREATE POLICY "Los admins pueden eliminar registros de conteo"
ON public.medicine_counts
FOR DELETE
USING (is_admin(auth.uid()));

-- Índice para búsquedas por proveedor
CREATE INDEX idx_medicine_counts_supplier ON public.medicine_counts(supplier_id);

-- Índice para búsquedas por fecha
CREATE INDEX idx_medicine_counts_created_at ON public.medicine_counts(created_at DESC);