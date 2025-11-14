-- Función para verificar si todos los documentos requeridos de un proveedor están aprobados
-- y actualizar automáticamente el campo approved en profiles
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
BEGIN
  -- Solo ejecutar si se actualizó el status del documento
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) OR TG_OP = 'INSERT' THEN
    
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
      WHERE id = NEW.supplier_id;
      
      RAISE NOTICE 'Proveedor % aprobado automáticamente - Documentos aprobados: %/%', 
        NEW.supplier_id, approved_count, total_required;
    ELSE
      -- Si falta algún documento o fue rechazado, quitar aprobación
      UPDATE public.profiles
      SET approved = false
      WHERE id = NEW.supplier_id;
      
      RAISE NOTICE 'Proveedor % sin aprobación - Documentos aprobados: %/%', 
        NEW.supplier_id, approved_count, total_required;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger que ejecuta la función cuando se actualiza el status de un documento
DROP TRIGGER IF EXISTS trigger_check_supplier_approval ON public.documents;

CREATE TRIGGER trigger_check_supplier_approval
  AFTER INSERT OR UPDATE OF status ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.check_and_update_supplier_approval();