
-- Table for authorized WhatsApp sales requesters
CREATE TABLE public.whatsapp_sales_requesters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.whatsapp_sales_requesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los admins pueden ver requesters" ON public.whatsapp_sales_requesters FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Los admins pueden insertar requesters" ON public.whatsapp_sales_requesters FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Los admins pueden actualizar requesters" ON public.whatsapp_sales_requesters FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Los admins pueden eliminar requesters" ON public.whatsapp_sales_requesters FOR DELETE USING (is_admin(auth.uid()));

-- Add source tracking to sales_requests
ALTER TABLE public.sales_requests ADD COLUMN source_phone TEXT;
ALTER TABLE public.sales_requests ADD COLUMN contact_name TEXT;
