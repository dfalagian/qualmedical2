-- Crear tabla para almacenar los complementos de pago que suben los proveedores
-- Cada complemento está asociado a un payment_proof específico
CREATE TABLE public.payment_complements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_proof_id UUID NOT NULL REFERENCES public.payment_proofs(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  xml_url TEXT NOT NULL,
  pdf_url TEXT,
  uuid_cfdi TEXT,
  fecha_pago DATE,
  monto NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_payment_complements_payment_proof_id ON public.payment_complements(payment_proof_id);
CREATE INDEX idx_payment_complements_invoice_id ON public.payment_complements(invoice_id);
CREATE INDEX idx_payment_complements_supplier_id ON public.payment_complements(supplier_id);

-- Habilitar RLS
ALTER TABLE public.payment_complements ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para admins
CREATE POLICY "Los admins pueden ver todos los complementos"
ON public.payment_complements FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar complementos"
ON public.payment_complements FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar complementos"
ON public.payment_complements FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar complementos"
ON public.payment_complements FOR DELETE
USING (is_admin(auth.uid()));

-- Políticas RLS para proveedores
CREATE POLICY "Los proveedores pueden ver sus propios complementos"
ON public.payment_complements FOR SELECT
USING (auth.uid() = supplier_id);

CREATE POLICY "Los proveedores pueden insertar sus propios complementos"
ON public.payment_complements FOR INSERT
WITH CHECK (auth.uid() = supplier_id);

CREATE POLICY "Los proveedores pueden actualizar sus propios complementos"
ON public.payment_complements FOR UPDATE
USING (auth.uid() = supplier_id);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_payment_complements_updated_at
BEFORE UPDATE ON public.payment_complements
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();