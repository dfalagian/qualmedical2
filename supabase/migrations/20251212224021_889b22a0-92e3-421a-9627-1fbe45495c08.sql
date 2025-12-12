-- Crear tabla para pagos parciales/cuotas
CREATE TABLE public.payment_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id UUID NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  expected_amount NUMERIC NOT NULL,
  actual_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'pendiente',
  payment_date DATE,
  comprobante_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(pago_id, installment_number)
);

-- Agregar columnas a la tabla pagos para manejar divisiones
ALTER TABLE public.pagos 
  ADD COLUMN IF NOT EXISTS is_split_payment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_installments INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC;

-- Habilitar RLS
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Los admins pueden ver todas las cuotas"
  ON public.payment_installments
  FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden ver cuotas de sus pagos"
  ON public.payment_installments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pagos
      WHERE pagos.id = payment_installments.pago_id
      AND pagos.supplier_id = auth.uid()
    )
  );

CREATE POLICY "Los admins pueden insertar cuotas"
  ON public.payment_installments
  FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar cuotas"
  ON public.payment_installments
  FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar cuotas"
  ON public.payment_installments
  FOR DELETE
  USING (is_admin(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_payment_installments_updated_at
  BEFORE UPDATE ON public.payment_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();