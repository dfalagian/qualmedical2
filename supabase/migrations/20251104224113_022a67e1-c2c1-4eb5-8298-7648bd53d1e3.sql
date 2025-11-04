-- Eliminar la política restrictiva actual para proveedores
DROP POLICY IF EXISTS "Los proveedores no pueden actualizar facturas después de crear" ON public.invoices;

-- Crear nueva política que permita a los proveedores actualizar solo el campo de evidencia de entrega
CREATE POLICY "Los proveedores pueden actualizar evidencia de entrega"
ON public.invoices
FOR UPDATE
USING (auth.uid() = supplier_id)
WITH CHECK (auth.uid() = supplier_id);

-- Comentario explicativo
COMMENT ON POLICY "Los proveedores pueden actualizar evidencia de entrega" ON public.invoices IS 
'Permite a los proveedores actualizar sus propias facturas, especialmente el campo delivery_evidence_url';