-- Eliminar la política existente de eliminación para proveedores
DROP POLICY IF EXISTS "Los proveedores pueden eliminar sus documentos rechazados" ON public.documents;

-- Crear nueva política que permita eliminar documentos rechazados por admin O rechazados por IA
CREATE POLICY "Los proveedores pueden eliminar documentos rechazados o fallidos"
ON public.documents
FOR DELETE
TO authenticated
USING (
  auth.uid() = supplier_id 
  AND (
    status = 'rechazado'::document_status 
    OR extraction_status = 'failed'
  )
);