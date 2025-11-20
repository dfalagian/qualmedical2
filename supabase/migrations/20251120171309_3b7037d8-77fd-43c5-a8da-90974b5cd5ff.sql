-- Agregar campos para controlar entregas parciales en medicine_counts
ALTER TABLE public.medicine_counts
ADD COLUMN expected_quantity integer,
ADD COLUMN is_partial_delivery boolean DEFAULT false;

-- Agregar comentarios para documentar
COMMENT ON COLUMN public.medicine_counts.expected_quantity IS 'Cantidad esperada según la orden de compra';
COMMENT ON COLUMN public.medicine_counts.is_partial_delivery IS 'Indica si es una entrega parcial (cantidad entregada < cantidad esperada)';