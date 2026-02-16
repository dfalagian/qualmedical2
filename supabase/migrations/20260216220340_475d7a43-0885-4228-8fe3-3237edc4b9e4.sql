
-- Allow vendedores to read notification recipients so POS notifications work
CREATE POLICY "Vendedores pueden ver destinatarios de notificaciones"
ON public.notification_recipients
FOR SELECT
USING (has_role(auth.uid(), 'vendedor'::user_role));
