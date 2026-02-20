/**
 * Formatea una fecha a string YYYY-MM-DD usando zona horaria local (México UTC-6).
 * Evita el desfase de un día que ocurre al usar .toISOString() en zonas horarias negativas.
 */
export const toLocalDateStr = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Retorna la fecha actual como string YYYY-MM-DD en zona horaria local.
 */
export const todayLocalStr = (): string => toLocalDateStr(new Date());

/**
 * Formatea el nombre del proveedor a mayúsculas
 * @param profile - Objeto con company_name y/o full_name
 * @returns Nombre del proveedor en mayúsculas o "N/A"
 */
export const formatSupplierName = (profile: { company_name?: string | null; full_name?: string | null } | null | undefined): string => {
  const name = profile?.company_name || profile?.full_name;
  return name ? name.toUpperCase() : "N/A";
};
