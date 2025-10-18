-- Crear tipo enum para roles de usuario
CREATE TYPE public.user_role AS ENUM ('admin', 'proveedor');

-- Crear tipo enum para estado de documentos
CREATE TYPE public.document_status AS ENUM ('pendiente', 'aprobado', 'rechazado');

-- Crear tipo enum para estado de pagos
CREATE TYPE public.payment_status AS ENUM ('pendiente', 'procesando', 'pagado', 'rechazado');

-- Crear tipo enum para tipo de documento
CREATE TYPE public.document_type AS ENUM (
  'factura',
  'contrato',
  'certificado',
  'constancia_fiscal',
  'acta_constitutiva',
  'comprobante_domicilio'
);

-- Tabla de perfiles de usuario (vinculada a auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  rfc TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de roles de usuario
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Tabla de documentos
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status document_status DEFAULT 'pendiente',
  version INTEGER DEFAULT 1,
  notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de historial de versiones de documentos
CREATE TABLE public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  status document_status NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de facturas para pagos
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'MXN',
  pdf_url TEXT NOT NULL,
  xml_url TEXT NOT NULL,
  status payment_status DEFAULT 'pendiente',
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de órdenes de compra
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL UNIQUE,
  description TEXT,
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'MXN',
  status TEXT DEFAULT 'pendiente',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de mensajes
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Función de seguridad para verificar roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Función de seguridad para verificar si es admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- RLS Policies para profiles
CREATE POLICY "Los usuarios pueden ver su propio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Los admins pueden ver todos los perfiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden insertar su propio perfil"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies para user_roles
CREATE POLICY "Los usuarios pueden ver sus propios roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Los admins pueden ver todos los roles"
  ON public.user_roles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- RLS Policies para documents
CREATE POLICY "Los proveedores pueden ver sus propios documentos"
  ON public.documents FOR SELECT
  USING (auth.uid() = supplier_id);

CREATE POLICY "Los admins pueden ver todos los documentos"
  ON public.documents FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden insertar sus propios documentos"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = supplier_id);

CREATE POLICY "Los proveedores pueden actualizar sus propios documentos"
  ON public.documents FOR UPDATE
  USING (auth.uid() = supplier_id AND status = 'pendiente');

CREATE POLICY "Los admins pueden actualizar todos los documentos"
  ON public.documents FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- RLS Policies para document_versions
CREATE POLICY "Los proveedores pueden ver versiones de sus documentos"
  ON public.document_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.supplier_id = auth.uid()
    )
  );

CREATE POLICY "Los admins pueden ver todas las versiones"
  ON public.document_versions FOR SELECT
  USING (public.is_admin(auth.uid()));

-- RLS Policies para invoices
CREATE POLICY "Los proveedores pueden ver sus propias facturas"
  ON public.invoices FOR SELECT
  USING (auth.uid() = supplier_id);

CREATE POLICY "Los admins pueden ver todas las facturas"
  ON public.invoices FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden insertar sus propias facturas"
  ON public.invoices FOR INSERT
  WITH CHECK (auth.uid() = supplier_id);

CREATE POLICY "Los admins pueden actualizar todas las facturas"
  ON public.invoices FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- RLS Policies para purchase_orders
CREATE POLICY "Los proveedores pueden ver sus propias órdenes"
  ON public.purchase_orders FOR SELECT
  USING (auth.uid() = supplier_id);

CREATE POLICY "Los admins pueden ver todas las órdenes"
  ON public.purchase_orders FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar órdenes"
  ON public.purchase_orders FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar órdenes"
  ON public.purchase_orders FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- RLS Policies para messages
CREATE POLICY "Los usuarios pueden ver mensajes enviados a ellos"
  ON public.messages FOR SELECT
  USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

CREATE POLICY "Los usuarios pueden enviar mensajes"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Los usuarios pueden marcar sus mensajes como leídos"
  ON public.messages FOR UPDATE
  USING (auth.uid() = to_user_id);

-- Trigger para crear perfil automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para crear versión de documento cuando se actualiza
CREATE OR REPLACE FUNCTION public.handle_document_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.file_url IS DISTINCT FROM NEW.file_url THEN
    INSERT INTO public.document_versions (
      document_id,
      file_url,
      file_name,
      version,
      status,
      notes
    ) VALUES (
      OLD.id,
      OLD.file_url,
      OLD.file_name,
      OLD.version,
      OLD.status,
      OLD.notes
    );
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_document_version
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_document_version();

-- Crear buckets de storage
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('documents', 'documents', false),
  ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Policies para storage de documentos
CREATE POLICY "Los proveedores pueden subir sus documentos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Los proveedores pueden ver sus documentos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Los admins pueden ver todos los documentos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    public.is_admin(auth.uid())
  );

-- Policies para storage de facturas
CREATE POLICY "Los proveedores pueden subir sus facturas"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'invoices' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Los proveedores pueden ver sus facturas"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoices' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Los admins pueden ver todas las facturas"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoices' AND
    public.is_admin(auth.uid())
  );