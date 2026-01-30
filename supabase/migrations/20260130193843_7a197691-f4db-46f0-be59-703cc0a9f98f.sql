-- Create warehouses table
CREATE TABLE public.warehouses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- RLS policies for warehouses
CREATE POLICY "Los admins pueden ver todos los almacenes" 
ON public.warehouses FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver almacenes" 
ON public.warehouses FOR SELECT 
USING (is_contador(auth.uid()));

CREATE POLICY "Usuarios inventario_rfid pueden ver almacenes" 
ON public.warehouses FOR SELECT 
USING (is_inventario_rfid(auth.uid()));

CREATE POLICY "Los admins pueden insertar almacenes" 
ON public.warehouses FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar almacenes" 
ON public.warehouses FOR UPDATE 
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar almacenes" 
ON public.warehouses FOR DELETE 
USING (is_admin(auth.uid()));

-- Add warehouse_id to products table
ALTER TABLE public.products 
ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);

-- Add warehouse_id to rfid_tags table (for location tracking)
ALTER TABLE public.rfid_tags 
ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);

-- Insert default warehouses
INSERT INTO public.warehouses (code, name, description) VALUES 
  ('PRINCIPAL', 'Almacén Principal', 'Almacén principal de QualMedical'),
  ('CITIO', 'Almacén CITIO', 'Almacén del sistema CITIO');

-- Set default warehouse for existing products (Principal)
UPDATE public.products 
SET warehouse_id = (SELECT id FROM public.warehouses WHERE code = 'PRINCIPAL')
WHERE warehouse_id IS NULL;

-- Set default warehouse for existing rfid_tags (Principal)
UPDATE public.rfid_tags 
SET warehouse_id = (SELECT id FROM public.warehouses WHERE code = 'PRINCIPAL')
WHERE warehouse_id IS NULL;

-- Create warehouse_transfers table for transfer history
CREATE TABLE public.warehouse_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid REFERENCES public.products(id),
  batch_id uuid REFERENCES public.product_batches(id),
  rfid_tag_id uuid REFERENCES public.rfid_tags(id),
  quantity integer,
  transfer_type text NOT NULL CHECK (transfer_type IN ('rfid', 'manual')),
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on warehouse_transfers
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for warehouse_transfers
CREATE POLICY "Los admins pueden ver todas las transferencias" 
ON public.warehouse_transfers FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver transferencias" 
ON public.warehouse_transfers FOR SELECT 
USING (is_contador(auth.uid()));

CREATE POLICY "Usuarios inventario_rfid pueden ver transferencias" 
ON public.warehouse_transfers FOR SELECT 
USING (is_inventario_rfid(auth.uid()));

CREATE POLICY "Los admins pueden crear transferencias" 
ON public.warehouse_transfers FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden crear transferencias" 
ON public.warehouse_transfers FOR INSERT 
WITH CHECK (is_contador(auth.uid()));

CREATE POLICY "Usuarios inventario_rfid pueden crear transferencias" 
ON public.warehouse_transfers FOR INSERT 
WITH CHECK (is_inventario_rfid(auth.uid()));