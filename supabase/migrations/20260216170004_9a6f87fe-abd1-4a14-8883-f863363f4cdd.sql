-- RLS policies for vendedor role

-- Products: read-only
CREATE POLICY "Vendedores pueden ver productos activos"
ON public.products FOR SELECT
USING (public.has_role(auth.uid(), 'vendedor') AND is_active = true);

-- Clients: read + create
CREATE POLICY "Vendedores pueden ver clientes"
ON public.clients FOR SELECT
USING (public.has_role(auth.uid(), 'vendedor'));

CREATE POLICY "Vendedores pueden crear clientes"
ON public.clients FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'vendedor'));

-- Quotes: CRUD on own drafts
CREATE POLICY "Vendedores pueden crear cotizaciones"
ON public.quotes FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'vendedor'));

CREATE POLICY "Vendedores pueden ver sus cotizaciones"
ON public.quotes FOR SELECT
USING (public.has_role(auth.uid(), 'vendedor') AND created_by = auth.uid());

CREATE POLICY "Vendedores pueden actualizar sus borradores"
ON public.quotes FOR UPDATE
USING (public.has_role(auth.uid(), 'vendedor') AND created_by = auth.uid() AND status = 'borrador');

-- Quote items
CREATE POLICY "Vendedores pueden insertar items cotizacion"
ON public.quote_items FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'vendedor'));

CREATE POLICY "Vendedores pueden ver items de sus cotizaciones"
ON public.quote_items FOR SELECT
USING (public.has_role(auth.uid(), 'vendedor') AND EXISTS (
  SELECT 1 FROM public.quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid()
));

CREATE POLICY "Vendedores pueden actualizar items de sus borradores"
ON public.quote_items FOR UPDATE
USING (public.has_role(auth.uid(), 'vendedor') AND EXISTS (
  SELECT 1 FROM public.quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid() AND quotes.status = 'borrador'
));

CREATE POLICY "Vendedores pueden eliminar items de sus borradores"
ON public.quote_items FOR DELETE
USING (public.has_role(auth.uid(), 'vendedor') AND EXISTS (
  SELECT 1 FROM public.quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid() AND quotes.status = 'borrador'
));

-- Product batches & warehouses: read-only
CREATE POLICY "Vendedores pueden ver lotes"
ON public.product_batches FOR SELECT
USING (public.has_role(auth.uid(), 'vendedor'));

CREATE POLICY "Vendedores pueden ver almacenes"
ON public.warehouses FOR SELECT
USING (public.has_role(auth.uid(), 'vendedor'));

-- Helper function
CREATE OR REPLACE FUNCTION public.is_vendedor(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'vendedor')
$$;