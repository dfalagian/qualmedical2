
-- Política temporal para permitir UPDATE en inventory_movements (se eliminará después)
CREATE POLICY "temp_admin_update_movements"
ON public.inventory_movements
FOR UPDATE
USING (is_admin(auth.uid()));
