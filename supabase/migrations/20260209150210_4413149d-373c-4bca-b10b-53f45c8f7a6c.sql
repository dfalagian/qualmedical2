
-- Add invoice_id column to purchase_orders for linking purchase invoices
ALTER TABLE public.purchase_orders
ADD COLUMN invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_purchase_orders_invoice_id ON public.purchase_orders(invoice_id);
