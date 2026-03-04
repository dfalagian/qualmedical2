
ALTER TABLE public.inventory_movements 
ADD COLUMN batch_id UUID REFERENCES public.product_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_inventory_movements_batch_id ON public.inventory_movements(batch_id);
