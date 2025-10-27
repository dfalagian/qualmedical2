-- Drop existing INSERT policy for medicine_counts
DROP POLICY IF EXISTS "Los admins pueden insertar registros de conteo" ON medicine_counts;

-- Create new INSERT policy that allows admins to insert
CREATE POLICY "Los admins pueden insertar registros de conteo"
ON medicine_counts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
);