
-- =====================================================
-- SOLUCIÓN ARQUITECTURAL: Tabla warehouse_stock
-- Permite rastrear stock por producto POR ALMACÉN
-- independientemente, sin restricción de SKU único
-- =====================================================

-- 1. Crear tabla warehouse_stock
CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  current_stock INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);

-- 2. Habilitar RLS
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS
CREATE POLICY "Los admins pueden ver warehouse_stock"
  ON public.warehouse_stock FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar warehouse_stock"
  ON public.warehouse_stock FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar warehouse_stock"
  ON public.warehouse_stock FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar warehouse_stock"
  ON public.warehouse_stock FOR DELETE
  USING (is_admin(auth.uid()));

CREATE POLICY "Inventario RFID puede ver warehouse_stock"
  ON public.warehouse_stock FOR SELECT
  USING (is_admin(auth.uid()) OR is_inventario_rfid(auth.uid()));

-- 4. Trigger para updated_at
CREATE TRIGGER update_warehouse_stock_updated_at
  BEFORE UPDATE ON public.warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. Poblar con datos actuales: cada producto con su warehouse_id y current_stock
-- Solo productos activos que tienen un warehouse_id asignado
INSERT INTO public.warehouse_stock (product_id, warehouse_id, current_stock)
SELECT 
  p.id,
  p.warehouse_id,
  COALESCE(p.current_stock, 0)
FROM public.products p
WHERE p.warehouse_id IS NOT NULL
  AND p.is_active = true
ON CONFLICT (product_id, warehouse_id) DO UPDATE
  SET current_stock = EXCLUDED.current_stock,
      updated_at = now();
