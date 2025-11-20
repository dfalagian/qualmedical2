-- Agregar campo para número de orden de compra en medicine_counts
ALTER TABLE public.medicine_counts 
ADD COLUMN purchase_order_number TEXT;

-- Agregar índice para búsquedas más rápidas
CREATE INDEX idx_medicine_counts_po_number ON public.medicine_counts(purchase_order_number);

COMMENT ON COLUMN public.medicine_counts.purchase_order_number IS 'Número de orden de compra asociada al conteo (ej: OC_CITIO_25_05, CPED25-24)';