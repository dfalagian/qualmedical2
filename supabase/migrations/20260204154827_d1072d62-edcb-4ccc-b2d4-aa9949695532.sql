-- Create table for sales invoices (facturas de venta)
CREATE TABLE public.sales_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folio TEXT NOT NULL,
  uuid TEXT UNIQUE,
  fecha_emision TIMESTAMP WITH TIME ZONE,
  subtotal NUMERIC,
  total NUMERIC NOT NULL,
  currency TEXT DEFAULT 'MXN',
  emisor_nombre TEXT,
  emisor_rfc TEXT,
  receptor_nombre TEXT,
  receptor_rfc TEXT,
  xml_url TEXT NOT NULL,
  pdf_url TEXT,
  quote_id UUID REFERENCES public.quotes(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;

-- Only admins can manage sales invoices
CREATE POLICY "Los admins pueden ver facturas de venta"
  ON public.sales_invoices FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar facturas de venta"
  ON public.sales_invoices FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar facturas de venta"
  ON public.sales_invoices FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar facturas de venta"
  ON public.sales_invoices FOR DELETE
  USING (is_admin(auth.uid()));