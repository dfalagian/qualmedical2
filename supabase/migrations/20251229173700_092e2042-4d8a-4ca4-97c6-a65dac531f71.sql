
-- Eliminar políticas restrictivas actuales de SELECT en invoices
DROP POLICY IF EXISTS "Los admins pueden ver todas las facturas" ON public.invoices;
DROP POLICY IF EXISTS "Los proveedores pueden ver sus propias facturas" ON public.invoices;

-- Crear políticas PERMISIVAS (por defecto) para SELECT
CREATE POLICY "Los admins pueden ver todas las facturas" 
ON public.invoices 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden ver sus propias facturas" 
ON public.invoices 
FOR SELECT 
USING (auth.uid() = supplier_id);
