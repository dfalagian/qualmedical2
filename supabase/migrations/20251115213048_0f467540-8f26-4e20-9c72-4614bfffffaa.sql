-- Agregar columnas para rastrear fechas de login
ALTER TABLE public.profiles 
ADD COLUMN first_login_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;

-- Crear función para actualizar fechas de login
CREATE OR REPLACE FUNCTION public.update_login_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Actualizar last_login_at siempre
  UPDATE public.profiles
  SET 
    last_login_at = NOW(),
    -- Solo actualizar first_login_at si es NULL (primer login)
    first_login_at = COALESCE(first_login_at, NOW())
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Crear trigger que se ejecuta después de cada login exitoso
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.update_login_timestamps();