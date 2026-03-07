CREATE POLICY "Los proveedores pueden insertar items de sus facturas"
ON public.invoice_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_items.invoice_id
    AND invoices.supplier_id = auth.uid()
  )
);