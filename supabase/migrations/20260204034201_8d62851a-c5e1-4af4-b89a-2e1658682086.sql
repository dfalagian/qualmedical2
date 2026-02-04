-- Agregar batch_id a quote_items para vincular con el lote específico
ALTER TABLE public.quote_items
ADD COLUMN batch_id uuid REFERENCES public.product_batches(id);

-- Agregar columna approved_at para registrar cuándo se aprobó la cotización
ALTER TABLE public.quotes
ADD COLUMN approved_at timestamp with time zone,
ADD COLUMN approved_by uuid REFERENCES public.profiles(id),
ADD COLUMN cancelled_at timestamp with time zone,
ADD COLUMN cancelled_by uuid REFERENCES public.profiles(id);