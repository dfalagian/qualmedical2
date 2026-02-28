-- Add UPDATE and DELETE policies for warehouse_transfers
CREATE POLICY "Los admins pueden actualizar transferencias"
  ON public.warehouse_transfers
  FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar transferencias"
  ON public.warehouse_transfers
  FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));
