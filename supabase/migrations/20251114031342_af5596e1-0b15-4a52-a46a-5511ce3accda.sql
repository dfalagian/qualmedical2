-- Agregar columna approved a la tabla profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;