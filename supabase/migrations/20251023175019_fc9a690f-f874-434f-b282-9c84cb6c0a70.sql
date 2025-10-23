-- Eliminar la política antigua que no permite eliminar facturas
DROP POLICY IF EXISTS "Nadie puede eliminar facturas" ON invoices;

-- Crear nueva política que permite a los admins eliminar facturas
CREATE POLICY "Los admins pueden eliminar facturas"
  ON invoices FOR DELETE
  USING (is_admin(auth.uid()));

-- Actualizar política de eliminación de items de facturas para permitir a admins
DROP POLICY IF EXISTS "Nadie puede eliminar items de facturas" ON invoice_items;

CREATE POLICY "Los admins pueden eliminar items de facturas"
  ON invoice_items FOR DELETE
  USING (is_admin(auth.uid()));