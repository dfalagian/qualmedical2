-- Crear tabla de lotes de productos
CREATE TABLE public.product_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  barcode TEXT NOT NULL,
  expiration_date DATE NOT NULL,
  initial_quantity INTEGER NOT NULL DEFAULT 0,
  current_quantity INTEGER NOT NULL DEFAULT 0,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Índice único para evitar duplicados de lote por producto
  UNIQUE(product_id, batch_number)
);

-- Agregar columna batch_id a rfid_tags para vincular tags con lotes
ALTER TABLE public.rfid_tags 
ADD COLUMN batch_id UUID REFERENCES public.product_batches(id) ON DELETE SET NULL;

-- Índices para búsquedas eficientes
CREATE INDEX idx_product_batches_product_id ON public.product_batches(product_id);
CREATE INDEX idx_product_batches_barcode ON public.product_batches(barcode);
CREATE INDEX idx_product_batches_expiration ON public.product_batches(expiration_date);
CREATE INDEX idx_product_batches_batch_number ON public.product_batches(batch_number);
CREATE INDEX idx_rfid_tags_batch_id ON public.rfid_tags(batch_id);

-- Habilitar RLS
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para admins
CREATE POLICY "Los admins pueden ver todos los lotes"
ON public.product_batches FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar lotes"
ON public.product_batches FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar lotes"
ON public.product_batches FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar lotes"
ON public.product_batches FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Políticas RLS para contadores
CREATE POLICY "Los contadores pueden ver lotes"
ON public.product_batches FOR SELECT
TO authenticated
USING (public.is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden insertar lotes"
ON public.product_batches FOR INSERT
TO authenticated
WITH CHECK (public.is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden actualizar lotes"
ON public.product_batches FOR UPDATE
TO authenticated
USING (public.is_contador(auth.uid()));

-- Políticas RLS para inventario_rfid
CREATE POLICY "Users inventario_rfid can view batches"
ON public.product_batches FOR SELECT
TO authenticated
USING (public.is_inventario_rfid(auth.uid()));

CREATE POLICY "Users inventario_rfid can insert batches"
ON public.product_batches FOR INSERT
TO authenticated
WITH CHECK (public.is_inventario_rfid(auth.uid()));

CREATE POLICY "Users inventario_rfid can update batches"
ON public.product_batches FOR UPDATE
TO authenticated
USING (public.is_inventario_rfid(auth.uid()));

CREATE POLICY "Users inventario_rfid can delete batches"
ON public.product_batches FOR DELETE
TO authenticated
USING (public.is_inventario_rfid(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_product_batches_updated_at
  BEFORE UPDATE ON public.product_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE public.product_batches IS 'Lotes de productos con número de lote, código de barras y fecha de caducidad';
COMMENT ON COLUMN public.product_batches.batch_number IS 'Número de lote del medicamento';
COMMENT ON COLUMN public.product_batches.barcode IS 'Código de barras del lote';
COMMENT ON COLUMN public.product_batches.expiration_date IS 'Fecha de caducidad del lote';
COMMENT ON COLUMN public.product_batches.initial_quantity IS 'Cantidad inicial recibida en el lote';
COMMENT ON COLUMN public.product_batches.current_quantity IS 'Cantidad actual disponible en el lote';