-- Arreglar políticas RLS para permitir que contadores inserten registros

-- Eliminar las políticas de INSERT restrictivas existentes
DROP POLICY IF EXISTS "Solo admins pueden insertar conteos de medicina" ON public.medicine_counts;
DROP POLICY IF EXISTS "Los contadores pueden insertar conteos de medicina" ON public.medicine_counts;

-- Crear políticas PERMISSIVE (que se evalúan con OR) para INSERT
CREATE POLICY "Admins pueden insertar conteos de medicina"
ON public.medicine_counts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid()) AND auth.uid() = created_by
);

CREATE POLICY "Contadores pueden insertar conteos de medicina"
ON public.medicine_counts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_contador(auth.uid()) AND auth.uid() = created_by
);