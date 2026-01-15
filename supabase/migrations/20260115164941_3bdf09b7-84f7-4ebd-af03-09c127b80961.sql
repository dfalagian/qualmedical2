-- Agregar política para que inventario_rfid pueda insertar productos
CREATE POLICY "Users inventario_rfid can insert products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (public.is_inventario_rfid(auth.uid()));

-- Agregar política para que inventario_rfid pueda actualizar productos
CREATE POLICY "Users inventario_rfid can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (public.is_inventario_rfid(auth.uid()));

-- Agregar política para que inventario_rfid pueda eliminar productos (opcional pero útil)
CREATE POLICY "Users inventario_rfid can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (public.is_inventario_rfid(auth.uid()));