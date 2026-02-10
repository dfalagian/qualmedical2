
-- Table to store sales requests from public submissions
CREATE TABLE public.sales_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  raw_text TEXT,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  extraction_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'nueva',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_requests ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access on sales_requests"
  ON public.sales_requests FOR ALL
  USING (public.is_admin(auth.uid()));

-- Public INSERT (no auth needed for submissions)
CREATE POLICY "Public can insert sales_requests"
  ON public.sales_requests FOR INSERT
  WITH CHECK (true);

-- Create storage bucket for public uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('sales-requests', 'sales-requests', true);

-- Anyone can upload to sales-requests bucket
CREATE POLICY "Public can upload to sales-requests"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'sales-requests');

-- Anyone can read from sales-requests bucket  
CREATE POLICY "Public can read sales-requests files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sales-requests');

-- Admins can delete from sales-requests
CREATE POLICY "Admins can delete sales-requests files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'sales-requests' AND public.is_admin(auth.uid()));
