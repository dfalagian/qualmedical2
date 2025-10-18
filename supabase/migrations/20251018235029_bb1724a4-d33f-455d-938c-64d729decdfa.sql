-- Permitir a los admins actualizar cualquier perfil
CREATE POLICY "Los admins pueden actualizar cualquier perfil"
ON public.profiles
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Permitir a los admins eliminar perfiles
CREATE POLICY "Los admins pueden eliminar perfiles"
ON public.profiles
FOR DELETE
USING (public.is_admin(auth.uid()));

-- Permitir a los admins eliminar roles
CREATE POLICY "Los admins pueden eliminar roles"
ON public.user_roles
FOR DELETE
USING (public.is_admin(auth.uid()));