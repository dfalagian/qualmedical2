
-- Step 1: Rename all to temporary folios to avoid unique constraint conflicts
UPDATE public.quotes
SET folio = 'TEMP-' || id
WHERE folio LIKE 'COT-QUAL-2026-%';

-- Step 2: Assign consecutive numbers by created_at
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) AS new_num
  FROM public.quotes
  WHERE folio LIKE 'TEMP-%'
)
UPDATE public.quotes q
SET folio = 'COT-QUAL-2026-' || LPAD(n.new_num::text, 3, '0')
FROM numbered n
WHERE q.id = n.id;
