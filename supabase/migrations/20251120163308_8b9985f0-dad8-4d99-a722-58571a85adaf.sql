-- Crear función para verificar si un usuario es contador
CREATE OR REPLACE FUNCTION public.is_contador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT public.has_role(_user_id, 'contador')
$$;

-- Agregar políticas RLS para contadores en medicine_counts
CREATE POLICY "Los contadores pueden ver todos los registros de conteo"
ON public.medicine_counts
FOR SELECT
TO authenticated
USING (is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden insertar conteos de medicina"
ON public.medicine_counts
FOR INSERT
TO authenticated
WITH CHECK (is_contador(auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Los contadores pueden actualizar registros de conteo"
ON public.medicine_counts
FOR UPDATE
TO authenticated
USING (is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden eliminar registros de conteo"
ON public.medicine_counts
FOR DELETE
TO authenticated
USING (is_contador(auth.uid()));

-- Los contadores necesitan ver los perfiles para el selector de proveedores
CREATE POLICY "Los contadores pueden ver perfiles de proveedores"
ON public.profiles
FOR SELECT
TO authenticated
USING (is_contador(auth.uid()));