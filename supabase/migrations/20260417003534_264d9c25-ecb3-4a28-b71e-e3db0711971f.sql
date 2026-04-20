-- Trigger de validación: prohíbe transferencias 'manual' sin lote asignado.
-- Las transferencias 'rfid' siguen permitidas sin batch_id porque usan rfid_tag_id.
CREATE OR REPLACE FUNCTION public.validate_warehouse_transfer_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.transfer_type = 'manual' AND NEW.batch_id IS NULL THEN
    RAISE EXCEPTION 'Las transferencias manuales requieren un lote asignado (batch_id). Producto: %, Cantidad: %', NEW.product_id, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_warehouse_transfer_batch ON public.warehouse_transfers;
CREATE TRIGGER trg_validate_warehouse_transfer_batch
  BEFORE INSERT OR UPDATE ON public.warehouse_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_warehouse_transfer_batch();