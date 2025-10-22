-- Eliminar usuario falagian@gmail.com
DO $$
DECLARE
  v_user_id uuid := 'feaf41fd-9ccf-4b53-9b26-8aed2e5bba6b';
BEGIN
  -- Eliminar roles
  DELETE FROM user_roles WHERE user_id = v_user_id;
  
  -- Eliminar perfil
  DELETE FROM profiles WHERE id = v_user_id;
  
  -- Eliminar auth user
  DELETE FROM auth.users WHERE id = v_user_id;
END $$;