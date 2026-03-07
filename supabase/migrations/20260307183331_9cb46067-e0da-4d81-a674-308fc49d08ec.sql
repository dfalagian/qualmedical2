CREATE POLICY "Proveedores pueden vincular factura a su OC"
ON public.purchase_orders
FOR UPDATE
TO authenticated
USING (auth.uid() = supplier_id)
WITH CHECK (auth.uid() = supplier_id);