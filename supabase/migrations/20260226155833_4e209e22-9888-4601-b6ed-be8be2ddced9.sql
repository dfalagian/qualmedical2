
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_phone TEXT NOT NULL,
  contact_name TEXT,
  message TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'incoming',
  whatsapp_message_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los admins pueden ver todos los mensajes WhatsApp"
  ON public.whatsapp_messages FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar mensajes WhatsApp"
  ON public.whatsapp_messages FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Service role puede insertar mensajes"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (true);
