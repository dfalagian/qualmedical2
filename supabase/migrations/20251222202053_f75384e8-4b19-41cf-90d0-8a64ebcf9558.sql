-- Tabla para almacenar múltiples comprobantes de pago por factura
CREATE TABLE public.payment_proofs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id UUID NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  proof_number INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL,
  comprobante_url TEXT NOT NULL,
  fecha_pago DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_payment_proofs_pago_id ON public.payment_proofs(pago_id);
CREATE INDEX idx_payment_proofs_invoice_id ON public.payment_proofs(invoice_id);

-- Enable RLS
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Los admins pueden ver todos los comprobantes"
ON public.payment_proofs
FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar comprobantes"
ON public.payment_proofs
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar comprobantes"
ON public.payment_proofs
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar comprobantes"
ON public.payment_proofs
FOR DELETE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden ver comprobantes de sus pagos"
ON public.payment_proofs
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.pagos
  WHERE pagos.id = payment_proofs.pago_id
  AND pagos.supplier_id = auth.uid()
));

-- Agregar campo de monto pagado acumulado a la tabla pagos
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;