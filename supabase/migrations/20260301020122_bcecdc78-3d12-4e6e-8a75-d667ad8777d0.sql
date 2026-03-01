
CREATE TABLE public.physical_inventory_counts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID REFERENCES public.product_batches(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  counted_quantity INTEGER NOT NULL,
  system_quantity INTEGER NOT NULL DEFAULT 0,
  difference INTEGER GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  notes TEXT,
  counted_by UUID NOT NULL,
  counted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.physical_inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los admins pueden ver conteos físicos" ON public.physical_inventory_counts FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Los admins pueden insertar conteos físicos" ON public.physical_inventory_counts FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Los admins pueden actualizar conteos físicos" ON public.physical_inventory_counts FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Los admins pueden eliminar conteos físicos" ON public.physical_inventory_counts FOR DELETE USING (is_admin(auth.uid()));
