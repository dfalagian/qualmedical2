-- 1. Add warehouse_id to quote_items
ALTER TABLE public.quote_items
ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);

-- 2. Add batch_id and warehouse_id to cipi_request_items
ALTER TABLE public.cipi_request_items
ADD COLUMN batch_id uuid REFERENCES public.product_batches(id),
ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);

-- Indexes for filtering performance
CREATE INDEX IF NOT EXISTS idx_quote_items_warehouse_id ON public.quote_items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_cipi_request_items_batch_id ON public.cipi_request_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_cipi_request_items_warehouse_id ON public.cipi_request_items(warehouse_id);