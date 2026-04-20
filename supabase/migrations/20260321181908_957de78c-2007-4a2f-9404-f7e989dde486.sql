ALTER TABLE purchase_orders 
  ADD COLUMN IF NOT EXISTS contpaqi_folio integer,
  ADD COLUMN IF NOT EXISTS contpaqi_doc_id integer,
  ADD COLUMN IF NOT EXISTS contpaqi_synced_at timestamptz;