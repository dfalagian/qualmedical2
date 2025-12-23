
-- Crear tabla de alertas de stock/movimiento
CREATE TABLE public.stock_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    rfid_tag_id UUID REFERENCES public.rfid_tags(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL, -- 'movement', 'low_stock', 'missing', 'unauthorized'
    previous_location TEXT,
    new_location TEXT,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES public.profiles(id)
);

-- Habilitar RLS
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para alertas
CREATE POLICY "Los admins pueden ver todas las alertas"
ON public.stock_alerts FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar alertas"
ON public.stock_alerts FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar alertas"
ON public.stock_alerts FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver alertas"
ON public.stock_alerts FOR SELECT
USING (is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden actualizar alertas"
ON public.stock_alerts FOR UPDATE
USING (is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden insertar alertas"
ON public.stock_alerts FOR INSERT
WITH CHECK (is_contador(auth.uid()));

-- Función para detectar cambio de ubicación y crear alerta
CREATE OR REPLACE FUNCTION public.check_tag_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Si la ubicación cambió y hay ubicación anterior
    IF OLD.last_location IS NOT NULL 
       AND OLD.last_location IS DISTINCT FROM NEW.last_location 
       AND NEW.last_location IS NOT NULL THEN
        
        INSERT INTO public.stock_alerts (
            rfid_tag_id,
            product_id,
            alert_type,
            previous_location,
            new_location,
            message,
            severity
        ) VALUES (
            NEW.id,
            NEW.product_id,
            'movement',
            OLD.last_location,
            NEW.last_location,
            'Tag ' || NEW.epc || ' movido de ' || OLD.last_location || ' a ' || NEW.last_location,
            CASE 
                WHEN OLD.last_location = 'Almacén' AND NEW.last_location = 'Salida' THEN 'warning'
                ELSE 'info'
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger para detectar movimientos
CREATE TRIGGER on_tag_location_change
BEFORE UPDATE ON public.rfid_tags
FOR EACH ROW
EXECUTE FUNCTION public.check_tag_movement();

-- Agregar índices para mejor rendimiento
CREATE INDEX idx_stock_alerts_created_at ON public.stock_alerts(created_at DESC);
CREATE INDEX idx_stock_alerts_is_read ON public.stock_alerts(is_read);
CREATE INDEX idx_rfid_tags_last_location ON public.rfid_tags(last_location);

-- Habilitar realtime para alertas
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_alerts;
