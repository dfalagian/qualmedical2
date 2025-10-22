-- Permitir que todos los usuarios autenticados vean los roles de admin
-- (necesario para el sistema de mensajes)
DROP POLICY IF EXISTS "Los usuarios pueden ver sus propios roles" ON public.user_roles;
DROP POLICY IF EXISTS "Todos pueden ver roles de admin" ON public.user_roles;

-- Política para que los usuarios vean sus propios roles
CREATE POLICY "Los usuarios pueden ver sus propios roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Nueva política: todos los usuarios autenticados pueden ver quiénes son admins
CREATE POLICY "Todos pueden ver roles de admin"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role = 'admin');