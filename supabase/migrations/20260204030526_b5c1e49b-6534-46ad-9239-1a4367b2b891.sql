-- Create quotes table
CREATE TABLE public.quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    folio text NOT NULL UNIQUE,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    concepto text,
    fecha_cotizacion date NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega date,
    factura_anterior text,
    fecha_factura_anterior date,
    monto_factura_anterior numeric(12,2),
    subtotal numeric(12,2) NOT NULL DEFAULT 0,
    total numeric(12,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'borrador',
    notes text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create quote items table
CREATE TABLE public.quote_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    nombre_producto text NOT NULL,
    marca text,
    lote text,
    fecha_caducidad date,
    cantidad integer NOT NULL DEFAULT 1,
    precio_unitario numeric(12,2) NOT NULL DEFAULT 0,
    importe numeric(12,2) NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

-- Create sequence for quote folio
CREATE SEQUENCE IF NOT EXISTS quote_folio_seq START 1;

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for quotes
CREATE POLICY "Los admins pueden ver todas las cotizaciones"
ON public.quotes FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar cotizaciones"
ON public.quotes FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar cotizaciones"
ON public.quotes FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar cotizaciones"
ON public.quotes FOR DELETE
USING (is_admin(auth.uid()));

-- RLS policies for quote_items
CREATE POLICY "Los admins pueden ver todos los items de cotizaciones"
ON public.quote_items FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar items de cotizaciones"
ON public.quote_items FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar items de cotizaciones"
ON public.quote_items FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar items de cotizaciones"
ON public.quote_items FOR DELETE
USING (is_admin(auth.uid()));

-- Function to generate quote folio
CREATE OR REPLACE FUNCTION public.generate_quote_folio()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_year text;
    next_num integer;
    new_folio text;
BEGIN
    current_year := EXTRACT(YEAR FROM CURRENT_DATE)::text;
    next_num := nextval('quote_folio_seq');
    new_folio := 'COT-QUAL-' || current_year || '-' || LPAD(next_num::text, 3, '0');
    RETURN new_folio;
END;
$$;

-- Create updated_at trigger
CREATE TRIGGER update_quotes_updated_at
    BEFORE UPDATE ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();