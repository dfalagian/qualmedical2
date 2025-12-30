-- Agregar política para que contador_proveedor pueda ver el perfil de su proveedor padre
CREATE POLICY "Contador proveedor puede ver perfil de su proveedor padre"
ON public.profiles
FOR SELECT
USING (
  is_contador_proveedor(auth.uid()) 
  AND id = get_parent_supplier_id(auth.uid())
);