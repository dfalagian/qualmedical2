-- Agrega campos del Complemento de Pago necesarios para el cruce con comprobante bancario
ALTER TABLE public.payment_complements
  ADD COLUMN IF NOT EXISTS num_parcialidad INTEGER,
  ADD COLUMN IF NOT EXISTS imp_saldo_ant NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS imp_saldo_insoluto NUMERIC(15,2);
