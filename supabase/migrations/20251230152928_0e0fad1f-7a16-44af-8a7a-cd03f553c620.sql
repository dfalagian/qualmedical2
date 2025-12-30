-- 1. Agregar columna parent_supplier_id a profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS parent_supplier_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Crear índice para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_profiles_parent_supplier ON public.profiles(parent_supplier_id) WHERE parent_supplier_id IS NOT NULL;

-- 3. Función para verificar si es contador_proveedor
CREATE OR REPLACE FUNCTION public.is_contador_proveedor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'contador_proveedor')
$$;

-- 4. Función para obtener el proveedor padre de un contador
CREATE OR REPLACE FUNCTION public.get_parent_supplier_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_supplier_id FROM public.profiles WHERE id = _user_id
$$;

-- 5. RLS: Contadores pueden ver conteos de medicamentos de su proveedor padre
CREATE POLICY "Contadores proveedor pueden ver conteos de su proveedor"
ON public.medicine_counts
FOR SELECT
USING (
  is_contador_proveedor(auth.uid()) 
  AND supplier_id = get_parent_supplier_id(auth.uid())
);

-- 6. RLS: Contadores pueden insertar conteos para su proveedor padre
CREATE POLICY "Contadores proveedor pueden insertar conteos"
ON public.medicine_counts
FOR INSERT
WITH CHECK (
  is_contador_proveedor(auth.uid()) 
  AND supplier_id = get_parent_supplier_id(auth.uid())
  AND created_by = auth.uid()
);

-- 7. RLS: Contadores pueden ver órdenes de compra de su proveedor padre
CREATE POLICY "Contadores proveedor pueden ver ordenes de su proveedor"
ON public.purchase_orders
FOR SELECT
USING (
  is_contador_proveedor(auth.uid()) 
  AND supplier_id = get_parent_supplier_id(auth.uid())
);

-- 8. RLS: Proveedores pueden ver perfiles de sus contadores
CREATE POLICY "Proveedores pueden ver perfiles de sus contadores"
ON public.profiles
FOR SELECT
USING (
  parent_supplier_id = auth.uid()
);

-- 9. RLS: Proveedores pueden actualizar perfiles de sus contadores
CREATE POLICY "Proveedores pueden actualizar perfiles de sus contadores"
ON public.profiles
FOR UPDATE
USING (
  parent_supplier_id = auth.uid()
);