-- Orden de las partidas en una cotización (reordenar por arrastre).
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
