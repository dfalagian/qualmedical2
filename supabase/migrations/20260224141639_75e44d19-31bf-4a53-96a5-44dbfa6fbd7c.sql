
-- Sequence for budget folios
CREATE SEQUENCE IF NOT EXISTS budget_folio_seq START 1;

-- Function to generate budget folio
CREATE OR REPLACE FUNCTION public.generate_budget_folio()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    next_num integer;
    new_folio text;
BEGIN
    next_num := nextval('budget_folio_seq');
    new_folio := 'PRESU_' || LPAD(next_num::text, 3, '0');
    RETURN new_folio;
END;
$function$;
