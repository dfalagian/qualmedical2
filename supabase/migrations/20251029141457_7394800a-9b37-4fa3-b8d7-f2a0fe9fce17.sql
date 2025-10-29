-- ============================================
-- MIGRACIÓN DE SEGURIDAD - QualMedical
-- Corrige 4 vulnerabilidades críticas
-- ============================================

-- 1. MEDICINE_COUNTS: Remover política temporal insegura
DROP POLICY IF EXISTS "temp_insert_policy" ON public.medicine_counts;

-- Crear política segura de INSERT para medicine_counts
CREATE POLICY "Solo admins pueden insertar conteos de medicina"
ON public.medicine_counts FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid()) AND
  auth.uid() = created_by
);

-- 2. PROFILES: Restringir acceso público a perfiles de admin
DROP POLICY IF EXISTS "Todos pueden ver perfiles de administradores" ON public.profiles;

-- Crear política para usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden ver perfiles de admin"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = profiles.id 
    AND user_roles.role = 'admin'
  )
);

-- 3. STORAGE: Hacer bucket documents privado
UPDATE storage.buckets 
SET public = false 
WHERE id = 'documents';

-- 4. STORAGE RLS: Políticas para acceso seguro a documentos
-- Los usuarios pueden ver sus propios documentos
CREATE POLICY "Usuarios ven sus propios documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (
    -- El usuario es dueño del archivo (carpeta con su user_id)
    auth.uid()::text = (storage.foldername(name))[1] OR
    -- O es admin
    public.is_admin(auth.uid())
  )
);

-- Los usuarios pueden subir a su propia carpeta
CREATE POLICY "Usuarios suben a su carpeta"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Los usuarios pueden actualizar sus propios archivos
CREATE POLICY "Usuarios actualizan sus archivos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (
    auth.uid()::text = (storage.foldername(name))[1] OR
    public.is_admin(auth.uid())
  )
);

-- Solo admins pueden eliminar
CREATE POLICY "Solo admins eliminan documentos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  public.is_admin(auth.uid())
);