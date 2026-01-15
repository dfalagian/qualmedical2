-- Crear función helper para verificar si es usuario de inventario RFID
CREATE OR REPLACE FUNCTION public.is_inventario_rfid(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'inventario_rfid')
$$;

-- Eliminar políticas existentes si las hay para recrearlas
DROP POLICY IF EXISTS "Users inventario_rfid can view products" ON public.products;
DROP POLICY IF EXISTS "Users inventario_rfid can view rfid_tags" ON public.rfid_tags;
DROP POLICY IF EXISTS "Users inventario_rfid can manage rfid_tags" ON public.rfid_tags;
DROP POLICY IF EXISTS "Users inventario_rfid can view movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Users inventario_rfid can create movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Users inventario_rfid can view stock_alerts" ON public.stock_alerts;

-- Políticas RLS para que usuarios inventario_rfid puedan ver productos
CREATE POLICY "Users inventario_rfid can view products"
ON public.products
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) 
  OR public.is_inventario_rfid(auth.uid())
  OR supplier_id = auth.uid()
);

-- Políticas para rfid_tags
CREATE POLICY "Users inventario_rfid can view rfid_tags"
ON public.rfid_tags
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) 
  OR public.is_inventario_rfid(auth.uid())
);

CREATE POLICY "Users inventario_rfid can manage rfid_tags"
ON public.rfid_tags
FOR ALL
TO authenticated
USING (
  public.is_admin(auth.uid()) 
  OR public.is_inventario_rfid(auth.uid())
);

-- Políticas para inventory_movements
CREATE POLICY "Users inventario_rfid can view movements"
ON public.inventory_movements
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) 
  OR public.is_inventario_rfid(auth.uid())
);

CREATE POLICY "Users inventario_rfid can create movements"
ON public.inventory_movements
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_inventario_rfid(auth.uid())
);

-- Políticas para stock_alerts
CREATE POLICY "Users inventario_rfid can view stock_alerts"
ON public.stock_alerts
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) 
  OR public.is_inventario_rfid(auth.uid())
);