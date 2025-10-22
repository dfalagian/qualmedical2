-- Permitir que todos los usuarios autenticados vean perfiles de administradores
-- (necesario para el sistema de mensajes)
CREATE POLICY "Todos pueden ver perfiles de administradores"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_roles.user_id = profiles.id 
    AND user_roles.role = 'admin'
  )
);