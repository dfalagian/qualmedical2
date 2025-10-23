-- Agregar campos adicionales a la tabla invoices para información del XML
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS emisor_nombre TEXT,
ADD COLUMN IF NOT EXISTS emisor_rfc TEXT,
ADD COLUMN IF NOT EXISTS emisor_regimen_fiscal TEXT,
ADD COLUMN IF NOT EXISTS receptor_nombre TEXT,
ADD COLUMN IF NOT EXISTS receptor_rfc TEXT,
ADD COLUMN IF NOT EXISTS receptor_uso_cfdi TEXT,
ADD COLUMN IF NOT EXISTS uuid TEXT,
ADD COLUMN IF NOT EXISTS subtotal NUMERIC,
ADD COLUMN IF NOT EXISTS descuento NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_impuestos NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS fecha_emision TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS lugar_expedicion TEXT,
ADD COLUMN IF NOT EXISTS forma_pago TEXT,
ADD COLUMN IF NOT EXISTS metodo_pago TEXT;

-- Crear tabla para los conceptos/artículos de las facturas
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  clave_prod_serv TEXT,
  clave_unidad TEXT,
  unidad TEXT,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC NOT NULL,
  valor_unitario NUMERIC NOT NULL,
  importe NUMERIC NOT NULL,
  descuento NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índice para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Habilitar RLS en la tabla invoice_items
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para invoice_items
CREATE POLICY "Los admins pueden ver todos los items de facturas"
  ON invoice_items FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden ver items de sus propias facturas"
  ON invoice_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND invoices.supplier_id = auth.uid()
    )
  );

CREATE POLICY "Solo admins pueden insertar items de facturas"
  ON invoice_items FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Nadie puede actualizar items de facturas"
  ON invoice_items FOR UPDATE
  USING (false);

CREATE POLICY "Nadie puede eliminar items de facturas"
  ON invoice_items FOR DELETE
  USING (false);