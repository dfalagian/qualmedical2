-- Agregar columna para dirección extraída de documentos
ALTER TABLE public.documents
ADD COLUMN direccion TEXT;

COMMENT ON COLUMN public.documents.direccion IS 'Dirección extraída del documento';