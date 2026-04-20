
-- Create batch_warehouse_stock table for explicit batch-warehouse mapping
CREATE TABLE public.batch_warehouse_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.product_batches(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (batch_id, warehouse_id)
);

-- Enable RLS
ALTER TABLE public.batch_warehouse_stock ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins pueden ver batch_warehouse_stock"
ON public.batch_warehouse_stock FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins pueden insertar batch_warehouse_stock"
ON public.batch_warehouse_stock FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins pueden actualizar batch_warehouse_stock"
ON public.batch_warehouse_stock FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins pueden eliminar batch_warehouse_stock"
ON public.batch_warehouse_stock FOR DELETE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Contadores pueden ver batch_warehouse_stock"
ON public.batch_warehouse_stock FOR SELECT
USING (public.is_contador(auth.uid()));

CREATE POLICY "Contadores pueden insertar batch_warehouse_stock"
ON public.batch_warehouse_stock FOR INSERT
WITH CHECK (public.is_contador(auth.uid()));

CREATE POLICY "Contadores pueden actualizar batch_warehouse_stock"
ON public.batch_warehouse_stock FOR UPDATE
USING (public.is_contador(auth.uid()));

CREATE POLICY "Inventario RFID pueden ver batch_warehouse_stock"
ON public.batch_warehouse_stock FOR SELECT
USING (public.is_inventario_rfid(auth.uid()));

CREATE POLICY "Inventario RFID pueden insertar batch_warehouse_stock"
ON public.batch_warehouse_stock FOR INSERT
WITH CHECK (public.is_inventario_rfid(auth.uid()));

CREATE POLICY "Inventario RFID pueden actualizar batch_warehouse_stock"
ON public.batch_warehouse_stock FOR UPDATE
USING (public.is_inventario_rfid(auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_batch_warehouse_stock_batch_id ON public.batch_warehouse_stock(batch_id);
CREATE INDEX idx_batch_warehouse_stock_warehouse_id ON public.batch_warehouse_stock(warehouse_id);

-- Updated_at trigger
CREATE TRIGGER update_batch_warehouse_stock_updated_at
BEFORE UPDATE ON public.batch_warehouse_stock
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
