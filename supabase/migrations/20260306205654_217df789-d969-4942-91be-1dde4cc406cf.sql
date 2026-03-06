CREATE POLICY "Proveedores pueden ver productos de sus ordenes de compra"
ON public.products
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    WHERE poi.product_id = products.id
    AND po.supplier_id = auth.uid()
  )
);