-- Permisos de subida/lectura para fotos del conteo de medicamentos (bucket: documents)
-- Nota: usamos una estructura de ruta: medicine-counts/{supplier_id}/...

-- INSERT (subida)
CREATE POLICY "medicine_counts_upload_admin_contador"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND (public.is_admin(auth.uid()) OR public.is_contador(auth.uid()))
);

CREATE POLICY "medicine_counts_upload_supplier"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "medicine_counts_upload_contador_proveedor"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND public.is_contador_proveedor(auth.uid())
  AND (storage.foldername(name))[2]::uuid = public.get_parent_supplier_id(auth.uid())
);

-- SELECT (lectura)
CREATE POLICY "medicine_counts_read_admin_contador"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND (public.is_admin(auth.uid()) OR public.is_contador(auth.uid()))
);

CREATE POLICY "medicine_counts_read_supplier"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "medicine_counts_read_contador_proveedor"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'medicine-counts'
  AND public.is_contador_proveedor(auth.uid())
  AND (storage.foldername(name))[2]::uuid = public.get_parent_supplier_id(auth.uid())
);
