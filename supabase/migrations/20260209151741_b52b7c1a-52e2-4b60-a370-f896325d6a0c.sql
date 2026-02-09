
-- Create table for official supplier invoices (extracted from XML)
CREATE TABLE public.general_supplier_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  general_supplier_id uuid NOT NULL REFERENCES public.general_suppliers(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  uuid text,
  amount numeric NOT NULL DEFAULT 0,
  subtotal numeric,
  total_impuestos numeric DEFAULT 0,
  descuento numeric DEFAULT 0,
  currency text DEFAULT 'MXN',
  fecha_emision timestamp with time zone,
  emisor_nombre text,
  emisor_rfc text,
  receptor_nombre text,
  receptor_rfc text,
  forma_pago text,
  metodo_pago text,
  lugar_expedicion text,
  xml_url text NOT NULL,
  pdf_url text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(general_supplier_id, uuid)
);

-- Enable RLS
ALTER TABLE public.general_supplier_invoices ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Admins pueden ver facturas de proveedores oficiales"
ON public.general_supplier_invoices FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins pueden insertar facturas de proveedores oficiales"
ON public.general_supplier_invoices FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins pueden actualizar facturas de proveedores oficiales"
ON public.general_supplier_invoices FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins pueden eliminar facturas de proveedores oficiales"
ON public.general_supplier_invoices FOR DELETE
USING (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_general_supplier_invoices_updated_at
  BEFORE UPDATE ON public.general_supplier_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Update purchase_orders to also reference general_supplier_invoices
ALTER TABLE public.purchase_orders
ADD COLUMN general_supplier_invoice_id uuid REFERENCES public.general_supplier_invoices(id) ON DELETE SET NULL;
