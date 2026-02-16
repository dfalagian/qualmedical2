
-- Tabla para gestionar destinatarios de notificaciones por evento
CREATE TABLE public.notification_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'both' CHECK (channel IN ('whatsapp', 'sms', 'both')),
  event_type TEXT NOT NULL DEFAULT 'pos_sale',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden gestionar destinatarios
CREATE POLICY "Los admins pueden ver destinatarios"
  ON public.notification_recipients FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar destinatarios"
  ON public.notification_recipients FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar destinatarios"
  ON public.notification_recipients FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar destinatarios"
  ON public.notification_recipients FOR DELETE
  USING (public.is_admin(auth.uid()));
