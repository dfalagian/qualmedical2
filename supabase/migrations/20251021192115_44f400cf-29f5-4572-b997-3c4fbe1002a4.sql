-- Agregar columna para validaciones de documentos
ALTER TABLE public.documents
ADD COLUMN validation_errors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN is_valid BOOLEAN DEFAULT true;

-- Agregar índice para búsquedas por validez
CREATE INDEX idx_documents_is_valid ON public.documents(is_valid);

COMMENT ON COLUMN public.documents.validation_errors IS 'Array de errores de validación encontrados en el documento';
COMMENT ON COLUMN public.documents.is_valid IS 'Indica si el documento cumple con todas las validaciones';