-- Recalculate subtotal on quotes based on corrected quote_items
UPDATE public.quotes q
SET subtotal = (
  SELECT COALESCE(SUM(qi.importe), 0)
  FROM public.quote_items qi
  WHERE qi.quote_id = q.id
),
total = (
  SELECT COALESCE(SUM(qi.importe), 0) + 
    COALESCE(SUM(
      CASE 
        WHEN p.category IS NULL OR LOWER(p.category) NOT IN ('medicamentos', 'oncologicos', 'inmunoterapia')
        THEN qi.importe * 0.16
        ELSE 0
      END
    ), 0)
  FROM public.quote_items qi
  LEFT JOIN public.products p ON p.id = qi.product_id
  WHERE qi.quote_id = q.id
)
WHERE q.status = 'borrador';