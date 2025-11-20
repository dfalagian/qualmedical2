-- Corregir políticas RLS para medicine_counts
-- El problema es que las políticas anteriores eran restrictivas por defecto
-- Necesitamos UNA política permisiva que permita a ambos roles insertar

-- Eliminar todas las políticas de INSERT existentes
DROP POLICY IF EXISTS "Admins pueden insertar conteos de medicina" ON public.medicine_counts;
DROP POLICY IF EXISTS "Contadores pueden insertar conteos de medicina" ON public.medicine_counts;
DROP POLICY IF EXISTS "Solo admins pueden insertar conteos de medicina" ON public.medicine_counts;
DROP POLICY IF EXISTS "Los contadores pueden insertar conteos de medicina" ON public.medicine_counts;

-- Crear UNA SOLA política permisiva que permita a admins y contadores insertar
CREATE POLICY "Admins y contadores pueden insertar conteos"
ON public.medicine_counts
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.is_contador(auth.uid())) 
  AND auth.uid() = created_by
);