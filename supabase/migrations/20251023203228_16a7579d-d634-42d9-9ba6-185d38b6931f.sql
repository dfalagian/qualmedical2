-- Agregar política para permitir a proveedores eliminar sus documentos rechazados
CREATE POLICY "Los proveedores pueden eliminar sus documentos rechazados"
ON public.documents
FOR DELETE
USING (
  auth.uid() = supplier_id 
  AND status = 'rechazado'::document_status
);