-- Allow contadores and admins to read user_roles table to filter suppliers
CREATE POLICY "contadores_can_read_roles" ON public.user_roles
  FOR SELECT
  USING (
    public.is_admin(auth.uid()) OR 
    public.is_contador(auth.uid())
  );