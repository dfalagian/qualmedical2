-- Catálogo de tipos de movimiento de inventario
CREATE TABLE public.inventory_movement_types (
  code    TEXT PRIMARY KEY,
  label   TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('E', 'S')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.inventory_movement_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos los autenticados pueden ver tipos de movimiento"
  ON public.inventory_movement_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins pueden gestionar tipos de movimiento"
  ON public.inventory_movement_types FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Datos del catálogo
INSERT INTO public.inventory_movement_types (code, label, direction) VALUES
  ('BON',  'BONIFICACION',                    'E'),
  ('A++',  'Artículos promocionales',         'E'),
  ('REG',  'REGALO',                          'E'),
  ('EX+',  'ENTRADA EXCEL',                   'E'),
  ('PRO',  'PROMOCION',                       'E'),
  ('PR',   'PROMOCION DEL PROVEEDOR',         'E'),
  ('T+',   'TRASPASO',                        'E'),
  ('OE',   'ORDEN - ENTRADA',                 'E'),
  ('II',   'INVENTARIO INICIAL',              'E'),
  ('FF',   'FALLA DE FABRIC',                 'E'),
  ('EF',   'ENT.DE FABRIC.',                  'E'),
  ('DV',   'DEVOL. VENTA',                    'E'),
  ('DP',   'DE PRODUCCION',                   'E'),
  ('DE',   'ENSAMBLADO(DE)',                  'E'),
  ('CV',   'CANCEL. VENTA',                   'E'),
  ('CR',   'CANC. REMISION',                  'E'),
  ('COM',  'COMPRA',                          'E'),
  ('CI',   'CIERRE DE INVENTARIO',            'E'),
  ('AA',   'AJUSTE INV POST',                 'E'),
  ('A+',   'AJUSTE +',                        'E'),
  ('T01',  'Transferencia a estacion 01',     'S'),
  ('EX-',  'SALIDA DE EXCEL',                 'S'),
  ('COR',  'CORTESIA',                        'S'),
  ('RO',   'ROBO',                            'S'),
  ('MER',  'MERMA',                           'S'),
  ('T-',   'TRASPASO',                        'S'),
  ('SF',   'SAL.FABRICACION',                 'S'),
  ('RE',   'REGALO DE ARTS.',                 'S'),
  ('PF',   'PERDIDA FABRICA',                 'S'),
  ('NT',   'REMISION',                        'S'),
  ('IA',   'INV.INIC.AJUSTE',                 'S'),
  ('GA',   'GARANTIA',                        'S'),
  ('FAC',  'VTA. POR FACT.',                  'S'),
  ('EN',   'ENSAMBLE',                        'S'),
  ('DES',  'DESENSAMBLADO',                   'S'),
  ('DEN',  'DESENSAMBLADO(DE)',               'S'),
  ('DC',   'DEVOL. COMPRA',                   'S'),
  ('CC',   'CANCEL. COMPRA',                  'S'),
  ('AP',   'A PRODUCCION',                    'S'),
  ('AC',   'AJUSTE DE COSTO',                 'S'),
  ('A-',   'AJUSTE -',                        'S'),
  ('CNC',  'CANCELACION DE NOTA DE CREDITO',  'S');
