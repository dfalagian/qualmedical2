-- 1. Crear tabla de items de orden de compra
CREATE TABLE public.purchase_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER DEFAULT 0,
  unit_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Agregar referencia de orden de compra a medicine_counts
ALTER TABLE public.medicine_counts 
ADD COLUMN purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

-- 3. Agregar campo product_id a medicine_counts para vincular con producto específico
ALTER TABLE public.medicine_counts 
ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- 4. Habilitar RLS en purchase_order_items
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS para purchase_order_items
CREATE POLICY "Los admins pueden ver todos los items de órdenes"
ON public.purchase_order_items FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar items de órdenes"
ON public.purchase_order_items FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar items de órdenes"
ON public.purchase_order_items FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar items de órdenes"
ON public.purchase_order_items FOR DELETE
USING (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver items de órdenes"
ON public.purchase_order_items FOR SELECT
USING (is_contador(auth.uid()));

CREATE POLICY "Los proveedores pueden ver items de sus órdenes"
ON public.purchase_order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
    AND po.supplier_id = auth.uid()
  )
);

CREATE POLICY "Contadores proveedor pueden ver items de órdenes de su proveedor"
ON public.purchase_order_items FOR SELECT
USING (
  is_contador_proveedor(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
    AND po.supplier_id = get_parent_supplier_id(auth.uid())
  )
);

-- 6. Trigger para actualizar updated_at
CREATE TRIGGER update_purchase_order_items_updated_at
BEFORE UPDATE ON public.purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 7. Función para actualizar stock del producto cuando se confirma recepción
CREATE OR REPLACE FUNCTION public.update_product_stock_from_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar cantidad recibida en purchase_order_items si hay product_id y purchase_order_id
  IF NEW.product_id IS NOT NULL AND NEW.purchase_order_id IS NOT NULL THEN
    UPDATE public.purchase_order_items
    SET quantity_received = quantity_received + NEW.count
    WHERE purchase_order_id = NEW.purchase_order_id
    AND product_id = NEW.product_id;
  END IF;
  
  -- Actualizar stock global del producto
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
    SET current_stock = current_stock + NEW.count
    WHERE id = NEW.product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Trigger para actualizar stock al insertar conteo
CREATE TRIGGER update_stock_on_medicine_count
AFTER INSERT ON public.medicine_counts
FOR EACH ROW
EXECUTE FUNCTION public.update_product_stock_from_count();

-- 9. Índices para mejor rendimiento
CREATE INDEX idx_purchase_order_items_order ON public.purchase_order_items(purchase_order_id);
CREATE INDEX idx_purchase_order_items_product ON public.purchase_order_items(product_id);
CREATE INDEX idx_medicine_counts_order ON public.medicine_counts(purchase_order_id);
CREATE INDEX idx_medicine_counts_product ON public.medicine_counts(product_id);