-- Modificar la columna delivery_evidence_url para soportar múltiples URLs
-- Primero, creamos una nueva columna temporal con tipo array
ALTER TABLE invoices ADD COLUMN delivery_evidence_urls TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migrar datos existentes de delivery_evidence_url a delivery_evidence_urls
UPDATE invoices 
SET delivery_evidence_urls = ARRAY[delivery_evidence_url]
WHERE delivery_evidence_url IS NOT NULL AND delivery_evidence_url != '';

-- Eliminar la columna antigua
ALTER TABLE invoices DROP COLUMN delivery_evidence_url;

-- Renombrar la nueva columna
ALTER TABLE invoices RENAME COLUMN delivery_evidence_urls TO delivery_evidence_url;

-- Agregar comentario para documentar
COMMENT ON COLUMN invoices.delivery_evidence_url IS 'Array de URLs de evidencias de entrega (hasta 4 fotos)';