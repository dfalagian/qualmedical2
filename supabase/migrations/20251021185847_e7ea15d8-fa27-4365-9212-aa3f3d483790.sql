-- Agregar columnas para información extraída del acta constitutiva
ALTER TABLE public.documents
ADD COLUMN razon_social TEXT,
ADD COLUMN representante_legal TEXT,
ADD COLUMN objeto_social TEXT,
ADD COLUMN registro_publico TEXT,
ADD COLUMN extracted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed'));

-- Agregar índice para búsquedas más rápidas
CREATE INDEX idx_documents_extraction_status ON public.documents(extraction_status);

COMMENT ON COLUMN public.documents.razon_social IS 'Razón social extraída del acta constitutiva';
COMMENT ON COLUMN public.documents.representante_legal IS 'Representante legal extraído del acta constitutiva';
COMMENT ON COLUMN public.documents.objeto_social IS 'Objeto social extraído del acta constitutiva';
COMMENT ON COLUMN public.documents.registro_publico IS 'Registro público extraído del acta constitutiva';
COMMENT ON COLUMN public.documents.extracted_at IS 'Fecha y hora de extracción de información';
COMMENT ON COLUMN public.documents.extraction_status IS 'Estado del proceso de extracción: pending, processing, completed, failed';