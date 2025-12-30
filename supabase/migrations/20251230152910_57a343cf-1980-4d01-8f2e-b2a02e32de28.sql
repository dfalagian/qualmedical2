-- Paso 1: Solo agregar el nuevo valor al enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'contador_proveedor';