
-- Create activity_log table for audit trail
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  section TEXT NOT NULL, -- 'inventario', 'cotizaciones', 'compras_ventas', 'catalogo', 'ordenes_compra'
  action TEXT NOT NULL,  -- 'crear', 'editar', 'eliminar', 'importar', 'vincular', 'estado', etc.
  entity_type TEXT NOT NULL, -- 'producto', 'cotizacion', 'orden_compra', 'factura', 'lote', etc.
  entity_id TEXT,
  entity_name TEXT,
  details JSONB DEFAULT '{}'::jsonb, -- previous/new values, amounts, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for common queries
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at DESC);
CREATE INDEX idx_activity_log_section ON public.activity_log(section);
CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Los admins pueden ver toda la bitácora"
ON public.activity_log FOR SELECT
USING (public.is_admin(auth.uid()));

-- Any authenticated user can insert logs (their own actions)
CREATE POLICY "Los usuarios autenticados pueden insertar logs"
ON public.activity_log FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Nobody can update or delete logs (immutable audit trail)
CREATE POLICY "Nadie puede actualizar logs"
ON public.activity_log FOR UPDATE
USING (false);

CREATE POLICY "Nadie puede eliminar logs"
ON public.activity_log FOR DELETE
USING (false);
