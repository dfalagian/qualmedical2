-- Agregar 'cancelado' al enum payment_status
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'cancelado';