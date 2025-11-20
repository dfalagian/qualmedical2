-- Agregar políticas de storage para que admins y contadores puedan subir imágenes de conteo de medicinas

-- Política para permitir INSERT de imágenes en la carpeta medicine-counts
CREATE POLICY "Admins y contadores pueden subir imágenes de conteo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND (public.is_admin(auth.uid()) OR public.is_contador(auth.uid()))
);

-- Política para permitir SELECT/READ de las imágenes de conteo
CREATE POLICY "Admins y contadores pueden ver imágenes de conteo"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND (public.is_admin(auth.uid()) OR public.is_contador(auth.uid()))
);

-- Política para permitir UPDATE de imágenes
CREATE POLICY "Admins y contadores pueden actualizar imágenes de conteo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND (public.is_admin(auth.uid()) OR public.is_contador(auth.uid()))
);

-- Política para permitir DELETE de imágenes
CREATE POLICY "Admins y contadores pueden eliminar imágenes de conteo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND (public.is_admin(auth.uid()) OR public.is_contador(auth.uid()))
);