UPDATE public.products
SET category = CASE
  WHEN lower(trim(translate(category, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))) = 'medicamentos' THEN 'Medicamentos'
  WHEN lower(trim(translate(category, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))) = 'inmunoterapia' THEN 'Inmunoterapia'
  WHEN lower(trim(translate(category, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))) = 'oncologicos' THEN 'Oncológicos'
  ELSE trim(category)
END
WHERE category IS NOT NULL
  AND lower(trim(translate(category, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))) IN ('medicamentos', 'inmunoterapia', 'oncologicos');