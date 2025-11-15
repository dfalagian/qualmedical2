-- Migrar datos históricos de login desde auth.users a profiles
UPDATE public.profiles p
SET 
  first_login_at = au.created_at,
  last_login_at = au.last_sign_in_at
FROM auth.users au
WHERE p.id = au.id
  AND au.last_sign_in_at IS NOT NULL;