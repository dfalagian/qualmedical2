
CREATE TABLE public.whatsapp_bot_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users,
  notes TEXT
);

ALTER TABLE public.whatsapp_bot_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los admins pueden ver usuarios bot" ON public.whatsapp_bot_users FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Los admins pueden insertar usuarios bot" ON public.whatsapp_bot_users FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Los admins pueden actualizar usuarios bot" ON public.whatsapp_bot_users FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Los admins pueden eliminar usuarios bot" ON public.whatsapp_bot_users FOR DELETE USING (public.is_admin(auth.uid()));
