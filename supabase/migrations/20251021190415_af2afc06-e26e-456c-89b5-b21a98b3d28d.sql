-- Agregar columnas para información extraída de la constancia de situación fiscal
ALTER TABLE public.documents
ADD COLUMN rfc TEXT,
ADD COLUMN actividad_economica TEXT,
ADD COLUMN regimen_tributario TEXT,
ADD COLUMN fecha_emision DATE;

-- Agregar índice para búsquedas por RFC
CREATE INDEX idx_documents_rfc ON public.documents(rfc);

COMMENT ON COLUMN public.documents.rfc IS 'RFC extraído de la constancia de situación fiscal';
COMMENT ON COLUMN public.documents.actividad_economica IS 'Actividad económica extraída de la constancia';
COMMENT ON COLUMN public.documents.regimen_tributario IS 'Régimen tributario extraído de la constancia';
COMMENT ON COLUMN public.documents.fecha_emision IS 'Fecha de emisión del documento';