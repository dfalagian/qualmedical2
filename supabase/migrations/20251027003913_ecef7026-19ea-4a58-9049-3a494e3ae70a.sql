-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Los admins pueden insertar registros de conteo" ON public.medicine_counts;

-- Create a new INSERT policy that allows admins to insert with any created_by value
CREATE POLICY "Los admins pueden insertar registros de conteo"
ON public.medicine_counts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
);