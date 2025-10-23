-- Agregar el tipo de documento "ine" al enum existente
ALTER TYPE document_type ADD VALUE 'ine';

-- Agregar columnas para almacenar información extraída del INE
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS nombre_completo_ine TEXT,
ADD COLUMN IF NOT EXISTS curp TEXT;