-- Add rfid_required field to products table
-- When true, manual stock adjustments via +/- buttons are blocked
-- Only RFID scanning can modify stock for these products

ALTER TABLE public.products
ADD COLUMN rfid_required boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.products.rfid_required IS 'When true, stock can only be adjusted via RFID scanning, not manual +/- buttons';