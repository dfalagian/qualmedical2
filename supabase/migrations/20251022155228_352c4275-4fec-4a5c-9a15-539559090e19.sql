-- ============================================
-- SECURITY HARDENING MIGRATION
-- Implementa políticas RLS faltantes y mejoras de seguridad
-- ============================================

-- 1. PROTEGER VERSIONES DE DOCUMENTOS
-- Previene manipulación del historial de versiones
CREATE POLICY "Solo admins pueden insertar versiones de documentos"
ON public.document_versions
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Nadie puede actualizar versiones históricas"
ON public.document_versions
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Nadie puede eliminar versiones históricas"
ON public.document_versions
FOR DELETE
TO authenticated
USING (false);

-- 2. PROTEGER FACTURAS CONTRA MODIFICACIÓN
-- Los proveedores no pueden modificar facturas después de subirlas
CREATE POLICY "Los proveedores no pueden actualizar facturas después de crearlas"
ON public.invoices
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Nadie puede eliminar facturas"
ON public.invoices
FOR DELETE
TO authenticated
USING (false);

-- 3. PROTEGER ÓRDENES DE COMPRA
-- Solo admins pueden eliminar órdenes de compra
CREATE POLICY "Solo admins pueden eliminar órdenes de compra"
ON public.purchase_orders
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 4. PROTEGER MENSAJES
-- Los usuarios solo pueden eliminar mensajes que enviaron
CREATE POLICY "Los usuarios pueden eliminar sus propios mensajes enviados"
ON public.messages
FOR DELETE
TO authenticated
USING (auth.uid() = from_user_id);

-- 5. CORREGIR SEARCH PATH EN FUNCIONES
-- Previene ataques de inyección a través de búsqueda de esquemas

-- Actualizar función handle_document_version
CREATE OR REPLACE FUNCTION public.handle_document_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.file_url IS DISTINCT FROM NEW.file_url THEN
    INSERT INTO public.document_versions (
      document_id,
      file_url,
      file_name,
      version,
      status,
      notes
    ) VALUES (
      OLD.id,
      OLD.file_url,
      OLD.file_name,
      OLD.version,
      OLD.status,
      OLD.notes
    );
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Actualizar función handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 6. AGREGAR POLÍTICAS DE SEGURIDAD ADICIONALES PARA DOCUMENTOS
-- Prevenir que proveedores modifiquen documentos ya aprobados
DROP POLICY IF EXISTS "Los proveedores pueden actualizar sus propios documentos" ON public.documents;

CREATE POLICY "Los proveedores solo pueden actualizar documentos pendientes o rechazados"
ON public.documents
FOR UPDATE
TO authenticated
USING (
  auth.uid() = supplier_id 
  AND status IN ('pendiente', 'rechazado')
);

-- 7. AGREGAR POLÍTICA PARA PREVENIR ESCALACIÓN DE PRIVILEGIOS
-- Los usuarios no pueden cambiar su propio rol
CREATE POLICY "Los usuarios no pueden cambiar roles directamente"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) AND auth.uid() != user_id);

-- 8. PROTEGER PERFILES CONTRA MODIFICACIÓN DE DATOS CRÍTICOS
-- Agregar trigger para prevenir cambio de email por usuarios no-admin
CREATE OR REPLACE FUNCTION public.prevent_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Solo los administradores pueden cambiar el email';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_email_change_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_email_change();