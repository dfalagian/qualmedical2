-- Función para asignar automáticamente el rol de proveedor a nuevos usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo asignar rol de proveedor si no existe ningún rol para este usuario
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'proveedor');
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para asignar rol automáticamente cuando se crea un perfil
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();