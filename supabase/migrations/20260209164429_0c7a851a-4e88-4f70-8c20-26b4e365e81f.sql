-- Add received_date column to purchase_orders
ALTER TABLE public.purchase_orders
ADD COLUMN received_date date NULL;