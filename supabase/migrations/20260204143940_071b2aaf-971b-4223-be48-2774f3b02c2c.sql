-- Add column to track inventory exit status on approved quotes
ALTER TABLE public.quotes 
ADD COLUMN inventory_exit_status text DEFAULT 'pending' CHECK (inventory_exit_status IN ('pending', 'partial', 'completed'));

-- Add comment for clarity
COMMENT ON COLUMN public.quotes.inventory_exit_status IS 'Status of RFID/manual inventory exit: pending (not started), partial (some items scanned), completed (all items processed)';