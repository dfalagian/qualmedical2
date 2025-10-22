-- Agregar política RLS para que los admins puedan eliminar documentos
CREATE POLICY "Los admins pueden eliminar documentos"
ON public.documents
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));