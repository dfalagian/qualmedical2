UPDATE warehouse_transfers 
SET status = 'aprobada', 
    approved_at = created_at
WHERE created_at::date = '2026-02-11' 
AND status = 'pendiente'