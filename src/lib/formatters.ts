/**
 * Formatea el nombre del proveedor a mayúsculas
 * @param profile - Objeto con company_name y/o full_name
 * @returns Nombre del proveedor en mayúsculas o "N/A"
 */
export const formatSupplierName = (profile: { company_name?: string | null; full_name?: string | null } | null | undefined): string => {
  const name = profile?.company_name || profile?.full_name;
  return name ? name.toUpperCase() : "N/A";
};
