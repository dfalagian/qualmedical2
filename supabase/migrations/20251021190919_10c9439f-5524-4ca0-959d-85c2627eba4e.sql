-- Agregar columna para código postal del comprobante de domicilio
ALTER TABLE public.documents
ADD COLUMN codigo_postal TEXT;

-- Agregar índice para búsquedas por código postal
CREATE INDEX idx_documents_codigo_postal ON public.documents(codigo_postal);

COMMENT ON COLUMN public.documents.codigo_postal IS 'Código postal extraído del comprobante de domicilio';