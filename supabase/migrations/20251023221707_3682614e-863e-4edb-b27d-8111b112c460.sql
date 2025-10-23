-- Eliminar la política existente de eliminación para proveedores
DROP POLICY IF EXISTS "Los proveedores pueden eliminar documentos rechazados o fallidos" ON public.documents;

-- Crear nueva política que permita a los proveedores eliminar cualquiera de sus propios documentos
CREATE POLICY "Los proveedores pueden eliminar sus propios documentos"
ON public.documents
FOR DELETE
TO authenticated
USING (auth.uid() = supplier_id);