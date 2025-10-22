-- Script temporal para limpiar usuario huérfano
-- Este script se ejecutará una sola vez

DO $$
BEGIN
  -- Eliminar de auth.users el usuario huérfano
  DELETE FROM auth.users WHERE id = '2f0988ef-e24f-4f7f-ae3e-12eadaf0a88b';
END $$;