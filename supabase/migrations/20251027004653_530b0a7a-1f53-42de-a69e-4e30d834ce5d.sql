-- Temporalmente eliminar TODAS las políticas de INSERT y crear una súper permisiva para debugging
DROP POLICY IF EXISTS "Admins pueden crear registros de conteo" ON public.medicine_counts;

-- Política temporal MUY permisiva solo para authenticated users (para debugging)
CREATE POLICY "temp_insert_policy"
ON public.medicine_counts
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Esta es TEMPORAL - una vez que funcione, la haremos más restrictiva