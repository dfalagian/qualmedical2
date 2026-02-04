-- Eliminar constraint existente y recrear con CASCADE
ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_quote_id_fkey;

ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_quote_id_fkey
  FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;