-- Eliminar el trigger temporalmente
DROP TRIGGER IF EXISTS prevent_email_change_trigger ON public.profiles;

-- Actualizar el email en profiles
UPDATE public.profiles 
SET email = 'lupita@grupomdp.com', updated_at = now()
WHERE id = '5113fba0-a1ea-40a5-9e2a-1e848c183aa1';

-- Actualizar el email en auth.users
UPDATE auth.users 
SET 
  email = 'lupita@grupomdp.com',
  raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{email}',
    '"lupita@grupomdp.com"'
  )
WHERE id = '5113fba0-a1ea-40a5-9e2a-1e848c183aa1';

-- Recrear el trigger
CREATE TRIGGER prevent_email_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_email_change();