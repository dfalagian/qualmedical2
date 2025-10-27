-- Política para permitir que admins suban archivos al bucket documents en la carpeta medicine-counts
CREATE POLICY "Admins pueden subir conteos de medicamentos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);