-- Eliminar la política restrictiva existente
DROP POLICY IF EXISTS "Los proveedores pueden ver sus propios registros de conteo" ON public.medicine_counts;

-- Crear política permisiva para que los proveedores vean sus registros
CREATE POLICY "Los proveedores pueden ver sus propios registros de conteo"
ON public.medicine_counts
FOR SELECT
USING (auth.uid() = supplier_id);