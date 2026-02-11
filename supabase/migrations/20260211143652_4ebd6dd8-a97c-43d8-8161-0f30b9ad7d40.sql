-- Add sub-product tracking columns to quote_items
ALTER TABLE public.quote_items
ADD COLUMN is_sub_product boolean NOT NULL DEFAULT false,
ADD COLUMN parent_item_id uuid REFERENCES public.quote_items(id) ON DELETE CASCADE DEFAULT NULL;