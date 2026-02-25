
-- Add status and transfer_group_id to warehouse_transfers
-- status: pendiente (can be edited), aprobada (stock moved), cancelada
-- transfer_group_id: groups items that belong to the same transfer operation
ALTER TABLE public.warehouse_transfers 
  ADD COLUMN status text NOT NULL DEFAULT 'aprobada',
  ADD COLUMN transfer_group_id uuid DEFAULT NULL,
  ADD COLUMN approved_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN approved_by uuid DEFAULT NULL;

-- Set all existing transfers as 'aprobada' (they already moved stock)
UPDATE public.warehouse_transfers SET status = 'aprobada' WHERE status = 'aprobada';

-- Add index for quick group lookups
CREATE INDEX idx_warehouse_transfers_group ON public.warehouse_transfers(transfer_group_id);
CREATE INDEX idx_warehouse_transfers_status ON public.warehouse_transfers(status);
