ALTER TABLE public.warehouse_transfers 
ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
ADD COLUMN IF NOT EXISTS confirmed_by uuid;