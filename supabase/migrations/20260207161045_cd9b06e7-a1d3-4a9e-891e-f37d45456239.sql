-- Add supplier_type column to purchase_orders to distinguish between registered and general suppliers
ALTER TABLE public.purchase_orders
ADD COLUMN supplier_type text DEFAULT 'registered' CHECK (supplier_type IN ('registered', 'general'));

-- Add comment for documentation
COMMENT ON COLUMN public.purchase_orders.supplier_type IS 'Type of supplier: registered (from profiles table) or general (from general_suppliers table)';