-- Paso 1: Agregar nuevo rol para usuarios de Inventario RFID
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'inventario_rfid';