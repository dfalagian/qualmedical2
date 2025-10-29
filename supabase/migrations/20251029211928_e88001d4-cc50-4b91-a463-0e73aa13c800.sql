-- Agregar el nuevo tipo de documento 'datos_bancarios' al enum
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'datos_bancarios';

-- Agregar columnas para información bancaria a la tabla documents
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS numero_cuenta TEXT,
ADD COLUMN IF NOT EXISTS numero_cuenta_clabe TEXT,
ADD COLUMN IF NOT EXISTS nombre_cliente TEXT;