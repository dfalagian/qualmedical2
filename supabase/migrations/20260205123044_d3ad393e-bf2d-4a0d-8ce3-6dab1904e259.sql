-- Create storage policies for invoices bucket to allow admin uploads

-- Allow admins to upload files to invoices bucket
CREATE POLICY "Los admins pueden subir facturas al bucket invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices' 
  AND public.is_admin(auth.uid())
);

-- Allow admins to read files from invoices bucket
CREATE POLICY "Los admins pueden ver facturas del bucket invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND public.is_admin(auth.uid())
);

-- Allow admins to update files in invoices bucket
CREATE POLICY "Los admins pueden actualizar facturas del bucket invoices"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND public.is_admin(auth.uid())
);

-- Allow admins to delete files from invoices bucket
CREATE POLICY "Los admins pueden eliminar facturas del bucket invoices"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND public.is_admin(auth.uid())
);

-- Allow suppliers to read their own invoices (they upload via supplier_id path)
CREATE POLICY "Los proveedores pueden ver sus facturas del bucket invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow suppliers to upload their own invoices
CREATE POLICY "Los proveedores pueden subir sus facturas al bucket invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);