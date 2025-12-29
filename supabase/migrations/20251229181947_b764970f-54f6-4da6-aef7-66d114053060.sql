-- Política para que los proveedores puedan leer sus propios comprobantes de pago en el bucket documents
-- Los comprobantes se guardan en la ruta: {supplier_id}/comprobantes/...

-- Primero verificamos las políticas existentes y agregamos la nueva

-- Política: Los proveedores pueden ver archivos en su propia carpeta (incluyendo comprobantes subidos por admin)
CREATE POLICY "Proveedores pueden ver comprobantes en su carpeta"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Los admins pueden ver todos los archivos del bucket documents
CREATE POLICY "Admins pueden ver todos los archivos de documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.is_admin(auth.uid())
);