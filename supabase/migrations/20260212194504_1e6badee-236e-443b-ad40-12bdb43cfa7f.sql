
-- Create cipi_requests table for CIPI and CIPI Pro requests
CREATE TABLE public.cipi_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('cipi', 'cipi_pro')),
  folio TEXT,
  empresa TEXT,
  razon_social TEXT,
  rfc TEXT,
  cfdi TEXT,
  concepto TEXT,
  fecha_entrega DATE,
  fecha_cotizacion DATE,
  factura_anterior TEXT,
  fecha_ultima_factura DATE,
  monto_ultima_factura NUMERIC,
  subtotal NUMERIC DEFAULT 0,
  impuestos NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'nueva',
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  raw_text TEXT,
  extraction_status TEXT DEFAULT 'pending',
  extracted_data JSONB DEFAULT '{}'::jsonb,
  quote_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cipi_request_items table
CREATE TABLE public.cipi_request_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cipi_request_id UUID NOT NULL REFERENCES public.cipi_requests(id) ON DELETE CASCADE,
  categoria TEXT,
  descripcion TEXT NOT NULL,
  marca TEXT,
  lote TEXT,
  caducidad DATE,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC DEFAULT 0,
  iva NUMERIC DEFAULT 0,
  precio NUMERIC DEFAULT 0,
  product_id UUID REFERENCES public.products(id),
  matched_product_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cipi_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cipi_request_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for cipi_requests
CREATE POLICY "Los admins pueden ver todas las solicitudes CIPI"
  ON public.cipi_requests FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar solicitudes CIPI"
  ON public.cipi_requests FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar solicitudes CIPI"
  ON public.cipi_requests FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar solicitudes CIPI"
  ON public.cipi_requests FOR DELETE USING (is_admin(auth.uid()));

-- RLS policies for cipi_request_items
CREATE POLICY "Los admins pueden ver items CIPI"
  ON public.cipi_request_items FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar items CIPI"
  ON public.cipi_request_items FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar items CIPI"
  ON public.cipi_request_items FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar items CIPI"
  ON public.cipi_request_items FOR DELETE USING (is_admin(auth.uid()));

-- Foreign key for quote conversion
ALTER TABLE public.cipi_requests
  ADD CONSTRAINT cipi_requests_quote_id_fkey
  FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
