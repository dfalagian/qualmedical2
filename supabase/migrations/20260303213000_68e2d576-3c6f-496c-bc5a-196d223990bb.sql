
-- Add session_id to group physical inventory count entries by session
ALTER TABLE public.physical_inventory_counts 
ADD COLUMN session_id uuid DEFAULT gen_random_uuid();

-- Add warehouse_name for easier display in history
ALTER TABLE public.physical_inventory_counts
ADD COLUMN session_warehouse_name text;

-- Create index for session grouping
CREATE INDEX idx_physical_inventory_counts_session ON public.physical_inventory_counts(session_id);
