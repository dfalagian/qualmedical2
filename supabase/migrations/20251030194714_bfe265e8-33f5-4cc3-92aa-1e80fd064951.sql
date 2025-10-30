-- Permitir que los administradores suban comprobantes de pago
CREATE POLICY "Admins pueden subir comprobantes de pago"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND public.is_admin(auth.uid())
);

-- Permitir que los administradores actualicen archivos
CREATE POLICY "Admins pueden actualizar archivos en documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND public.is_admin(auth.uid())
);

-- Permitir que los usuarios vean sus propios documentos y admins vean todos
CREATE POLICY "Usuarios pueden ver sus documentos y admins todos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (
    public.is_admin(auth.uid())
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);