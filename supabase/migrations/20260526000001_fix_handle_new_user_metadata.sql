-- Actualizar trigger handle_new_user para leer todos los campos del proveedor
-- desde raw_user_meta_data al momento del registro (signup).
-- Esto evita depender de un upsert posterior que falla por RLS cuando
-- el email aún no está confirmado y no hay sesión activa.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, company_name, rfc, phone, tipo_persona, tipo_venta)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'rfc',
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    (NULLIF(NEW.raw_user_meta_data->>'tipo_persona', ''))::public.tipo_persona,
    (NULLIF(NEW.raw_user_meta_data->>'tipo_venta', ''))::public.tipo_venta
  );
  RETURN NEW;
END;
$$;
