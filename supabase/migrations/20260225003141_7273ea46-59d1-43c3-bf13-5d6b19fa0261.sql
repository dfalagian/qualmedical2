
-- Replace generate_quote_folio to use MAX from actual quotes instead of sequence
CREATE OR REPLACE FUNCTION public.generate_quote_folio()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_year text;
    max_num integer;
    new_folio text;
BEGIN
    current_year := EXTRACT(YEAR FROM CURRENT_DATE)::text;
    
    -- Find the max number from existing quotes with current year pattern
    SELECT COALESCE(MAX(
      CASE 
        WHEN folio ~ ('^COT-QUAL-' || current_year || '-[0-9]+$')
        THEN CAST(SUBSTRING(folio FROM '[0-9]+$') AS integer)
        ELSE 0
      END
    ), 0) INTO max_num
    FROM public.quotes
    WHERE folio LIKE 'COT-QUAL-' || current_year || '-%';
    
    new_folio := 'COT-QUAL-' || current_year || '-' || LPAD((max_num + 1)::text, 3, '0');
    RETURN new_folio;
END;
$function$;
