-- Crear tabla para histórico de precios de productos por proveedor
CREATE TABLE public.product_price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  price NUMERIC NOT NULL,
  previous_price NUMERIC,
  price_change_percentage NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN previous_price IS NOT NULL AND previous_price > 0 
      THEN ROUND(((price - previous_price) / previous_price) * 100, 2)
      ELSE NULL
    END
  ) STORED,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para búsquedas eficientes
CREATE INDEX idx_price_history_product ON public.product_price_history(product_id);
CREATE INDEX idx_price_history_supplier ON public.product_price_history(supplier_id);
CREATE INDEX idx_price_history_created ON public.product_price_history(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Los admins pueden ver todo el histórico de precios"
ON public.product_price_history FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar histórico de precios"
ON public.product_price_history FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver histórico de precios"
ON public.product_price_history FOR SELECT
USING (is_contador(auth.uid()));

CREATE POLICY "Los proveedores pueden ver histórico de sus precios"
ON public.product_price_history FOR SELECT
USING (auth.uid() = supplier_id);

-- Agregar columna de precio original a purchase_order_items
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS original_price NUMERIC,
ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS price_updated_by UUID REFERENCES public.profiles(id);