-- Primero elimino todas las políticas de INSERT existentes
DROP POLICY IF EXISTS "Los admins pueden insertar registros de conteo" ON public.medicine_counts;

-- Creo una nueva política más permisiva para INSERT que usa el rol directamente
CREATE POLICY "Admins pueden crear registros de conteo"
ON public.medicine_counts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);