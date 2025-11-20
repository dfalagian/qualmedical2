-- Agregar el rol 'contador' al enum existente
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'contador';