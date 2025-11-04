-- Agregar campo para evidencia de entrega en la tabla invoices
ALTER TABLE public.invoices 
ADD COLUMN delivery_evidence_url TEXT;

-- Comentario explicativo
COMMENT ON COLUMN public.invoices.delivery_evidence_url IS 'URL de la imagen de evidencia de entrega subida por el proveedor';