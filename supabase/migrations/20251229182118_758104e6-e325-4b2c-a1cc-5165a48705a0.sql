-- Eliminar las políticas duplicadas que se acaban de crear
DROP POLICY IF EXISTS "Proveedores pueden ver comprobantes en su carpeta" ON storage.objects;
DROP POLICY IF EXISTS "Admins pueden ver todos los archivos de documents" ON storage.objects;