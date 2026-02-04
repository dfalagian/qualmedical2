-- Crear tabla de clientes para cotizaciones
CREATE TABLE public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_cliente text NOT NULL,
    razon_social text,
    rfc text,
    cfdi text,
    direccion text,
    codigo_postal text,
    persona_contacto text,
    telefono text,
    email text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - Solo admins pueden gestionar clientes
CREATE POLICY "Los admins pueden ver todos los clientes"
ON public.clients FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar clientes"
ON public.clients FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar clientes"
ON public.clients FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar clientes"
ON public.clients FOR DELETE
USING (is_admin(auth.uid()));