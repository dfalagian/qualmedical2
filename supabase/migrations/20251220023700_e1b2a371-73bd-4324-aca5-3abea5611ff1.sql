-- Agregar 'ine_sanitario' al enum document_type
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'ine_sanitario';