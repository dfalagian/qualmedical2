
CREATE POLICY "temp_admin_update_movements_2"
ON public.inventory_movements
FOR UPDATE
USING (is_admin(auth.uid()));
