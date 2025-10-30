-- Agregar columna para almacenar el régimen fiscal extraído de la constancia fiscal
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS regimen_fiscal TEXT;