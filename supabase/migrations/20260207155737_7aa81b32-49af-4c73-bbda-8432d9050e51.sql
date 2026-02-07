-- Crear tabla para proveedores generales (externos como Costco)
CREATE TABLE public.general_suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rfc TEXT NOT NULL UNIQUE,
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT,
  direccion TEXT,
  codigo_postal TEXT,
  telefono TEXT,
  email TEXT,
  regimen_fiscal TEXT,
  lugar_expedicion TEXT,
  invoice_image_url TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.general_suppliers ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - Solo admins pueden gestionar proveedores generales
CREATE POLICY "Los admins pueden ver todos los proveedores generales"
  ON public.general_suppliers
  FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar proveedores generales"
  ON public.general_suppliers
  FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar proveedores generales"
  ON public.general_suppliers
  FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar proveedores generales"
  ON public.general_suppliers
  FOR DELETE
  USING (is_admin(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_general_suppliers_updated_at
  BEFORE UPDATE ON public.general_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Agregar comentario a la tabla
COMMENT ON TABLE public.general_suppliers IS 'Proveedores externos que no se registran en el portal (ej: Costco)';