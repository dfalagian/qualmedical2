-- Add items column to store invoice concepts as JSONB
ALTER TABLE public.sales_invoices 
ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;