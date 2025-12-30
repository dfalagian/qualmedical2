-- Agregar columnas para el nuevo sistema de captura de fotos en fases
-- Fase 1: Fotos de marca (hasta 4)
-- Fase 2: Fotos de lote/caducidad (hasta 4)
-- Fase 3: Acuse de recibo (1)

-- Renombrar image_url a brand_image_urls (array para hasta 4 fotos de marca)
ALTER TABLE public.medicine_counts 
ADD COLUMN brand_image_urls text[] DEFAULT ARRAY[]::text[];

-- Agregar columna para fotos de lote/caducidad (hasta 4)
ALTER TABLE public.medicine_counts 
ADD COLUMN lot_expiry_image_urls text[] DEFAULT ARRAY[]::text[];

-- Agregar columna para acuse de recibo (1 foto)
ALTER TABLE public.medicine_counts 
ADD COLUMN receipt_acknowledgment_url text;

-- Comentario: Los campos existentes se mantienen para compatibilidad:
-- - image_url: se usará para migrar datos antiguos a brand_image_urls[1]
-- - delivery_document_url: se puede eliminar más adelante ya que receipt_acknowledgment_url lo reemplaza