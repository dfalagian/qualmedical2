-- Crear tabla de pagos
CREATE TABLE public.pagos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  datos_bancarios_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(invoice_id)
);

-- Habilitar RLS
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Los admins pueden ver todos los pagos"
ON public.pagos
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar pagos"
ON public.pagos
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar pagos"
ON public.pagos
FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar pagos"
ON public.pagos
FOR DELETE
USING (is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden ver sus propios pagos"
ON public.pagos
FOR SELECT
USING (auth.uid() = supplier_id);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_pagos_updated_at
BEFORE UPDATE ON public.pagos
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();