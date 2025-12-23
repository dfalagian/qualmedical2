-- Crear tabla de productos para inventario RFID
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    unit TEXT DEFAULT 'pieza',
    minimum_stock INTEGER DEFAULT 0,
    current_stock INTEGER DEFAULT 0,
    unit_price NUMERIC(12,2),
    supplier_id UUID REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices para búsqueda
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_name ON public.products(name);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_supplier ON public.products(supplier_id);

-- Habilitar RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para products
CREATE POLICY "Los admins pueden ver todos los productos"
ON public.products FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar productos"
ON public.products FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar productos"
ON public.products FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar productos"
ON public.products FOR DELETE
USING (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver productos"
ON public.products FOR SELECT
USING (is_contador(auth.uid()));

CREATE POLICY "Los proveedores pueden ver sus productos"
ON public.products FOR SELECT
USING (auth.uid() = supplier_id);

-- Crear tabla de tags RFID
CREATE TABLE public.rfid_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    epc TEXT NOT NULL UNIQUE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'disponible' CHECK (status IN ('disponible', 'asignado', 'dañado', 'perdido')),
    last_read_at TIMESTAMP WITH TIME ZONE,
    last_location TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices para rfid_tags
CREATE INDEX idx_rfid_tags_epc ON public.rfid_tags(epc);
CREATE INDEX idx_rfid_tags_product ON public.rfid_tags(product_id);
CREATE INDEX idx_rfid_tags_status ON public.rfid_tags(status);

-- Habilitar RLS
ALTER TABLE public.rfid_tags ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para rfid_tags
CREATE POLICY "Los admins pueden ver todos los tags"
ON public.rfid_tags FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar tags"
ON public.rfid_tags FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar tags"
ON public.rfid_tags FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar tags"
ON public.rfid_tags FOR DELETE
USING (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver tags"
ON public.rfid_tags FOR SELECT
USING (is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden insertar tags"
ON public.rfid_tags FOR INSERT
WITH CHECK (is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden actualizar tags"
ON public.rfid_tags FOR UPDATE
USING (is_contador(auth.uid()));

-- Crear tabla de movimientos de inventario
CREATE TABLE public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    rfid_tag_id UUID REFERENCES public.rfid_tags(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'salida', 'ajuste', 'transferencia')),
    quantity INTEGER NOT NULL,
    previous_stock INTEGER,
    new_stock INTEGER,
    reference_type TEXT,
    reference_id UUID,
    location TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices para movimientos
CREATE INDEX idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_type ON public.inventory_movements(movement_type);
CREATE INDEX idx_inventory_movements_date ON public.inventory_movements(created_at);

-- Habilitar RLS
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para inventory_movements
CREATE POLICY "Los admins pueden ver todos los movimientos"
ON public.inventory_movements FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar movimientos"
ON public.inventory_movements FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los contadores pueden ver movimientos"
ON public.inventory_movements FOR SELECT
USING (is_contador(auth.uid()));

CREATE POLICY "Los contadores pueden insertar movimientos"
ON public.inventory_movements FOR INSERT
WITH CHECK (is_contador(auth.uid()));

-- Trigger para actualizar updated_at
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_rfid_tags_updated_at
BEFORE UPDATE ON public.rfid_tags
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Función para actualizar stock automáticamente
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Guardar stock anterior
    SELECT current_stock INTO NEW.previous_stock
    FROM products WHERE id = NEW.product_id;
    
    -- Actualizar stock del producto
    IF NEW.movement_type = 'entrada' THEN
        UPDATE products 
        SET current_stock = current_stock + NEW.quantity
        WHERE id = NEW.product_id
        RETURNING current_stock INTO NEW.new_stock;
    ELSIF NEW.movement_type = 'salida' THEN
        UPDATE products 
        SET current_stock = current_stock - NEW.quantity
        WHERE id = NEW.product_id
        RETURNING current_stock INTO NEW.new_stock;
    ELSIF NEW.movement_type = 'ajuste' THEN
        UPDATE products 
        SET current_stock = NEW.quantity
        WHERE id = NEW.product_id
        RETURNING current_stock INTO NEW.new_stock;
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_product_stock
BEFORE INSERT ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.update_product_stock();