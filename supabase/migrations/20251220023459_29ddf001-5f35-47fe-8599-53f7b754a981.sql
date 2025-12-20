-- Crear enums para tipo de persona y tipo de venta
CREATE TYPE public.tipo_persona AS ENUM ('fisica', 'moral');
CREATE TYPE public.tipo_venta AS ENUM ('medicamentos', 'otros');

-- Agregar columnas a profiles
ALTER TABLE public.profiles 
ADD COLUMN tipo_persona public.tipo_persona,
ADD COLUMN tipo_venta public.tipo_venta;