-- Simplificar la función de aprobación para que solo actualice el campo approved
-- La notificación de supplier_approved se manejará desde el frontend
CREATE OR REPLACE FUNCTION public.check_and_update_supplier_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_doc_types text[] := ARRAY['ine', 'constancia_fiscal', 'comprobante_domicilio', 'datos_bancarios'];
  approved_count integer;
  total_required integer;
  was_approved boolean;
BEGIN
  -- Solo ejecutar si se actualizó el status del documento
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) OR TG_OP = 'INSERT' THEN
    
    -- Obtener estado de aprobación actual del proveedor
    SELECT approved INTO was_approved
    FROM public.profiles
    WHERE id = NEW.supplier_id;
    
    -- Contar cuántos documentos requeridos están aprobados para este proveedor
    SELECT COUNT(DISTINCT document_type)
    INTO approved_count
    FROM public.documents
    WHERE supplier_id = NEW.supplier_id
      AND document_type = ANY(required_doc_types)
      AND status = 'aprobado';
    
    total_required := array_length(required_doc_types, 1);
    
    -- Si todos los documentos requeridos están aprobados, aprobar al proveedor
    IF approved_count >= total_required THEN
      UPDATE public.profiles
      SET approved = true
      WHERE id = NEW.supplier_id
        AND approved = false; -- Solo actualizar si cambió de false a true
      
      RAISE NOTICE 'Proveedor % aprobado automáticamente - Documentos aprobados: %/%', 
        NEW.supplier_id, approved_count, total_required;
    ELSE
      -- Si falta algún documento o fue rechazado, quitar aprobación
      UPDATE public.profiles
      SET approved = false
      WHERE id = NEW.supplier_id
        AND approved = true; -- Solo actualizar si cambió de true a false
      
      RAISE NOTICE 'Proveedor % sin aprobación - Documentos aprobados: %/%', 
        NEW.supplier_id, approved_count, total_required;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;