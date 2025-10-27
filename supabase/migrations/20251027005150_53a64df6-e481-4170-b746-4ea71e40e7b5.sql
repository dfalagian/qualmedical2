-- Primero eliminar cualquier constraint existente con ese nombre si existe
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'medicine_counts_supplier_id_fkey'
    ) THEN
        ALTER TABLE public.medicine_counts 
        DROP CONSTRAINT medicine_counts_supplier_id_fkey;
    END IF;
END $$;

-- Crear la foreign key hacia profiles
ALTER TABLE public.medicine_counts
ADD CONSTRAINT medicine_counts_supplier_id_fkey
FOREIGN KEY (supplier_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;