-- Agregar campo para almacenar URLs de imágenes generadas desde PDFs
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT ARRAY[]::text[];

-- Agregar índice para búsquedas por documentos con imágenes
CREATE INDEX IF NOT EXISTS idx_documents_image_urls ON public.documents USING GIN(image_urls);

COMMENT ON COLUMN public.documents.image_urls IS 'URLs de las imágenes generadas cuando el documento es un PDF escaneado';