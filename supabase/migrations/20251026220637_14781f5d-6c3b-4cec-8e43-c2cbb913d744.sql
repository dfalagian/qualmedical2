-- Add delivery document URL field to medicine_counts table
ALTER TABLE medicine_counts
ADD COLUMN delivery_document_url text;

COMMENT ON COLUMN medicine_counts.delivery_document_url IS 'URL of the signed delivery document photo';