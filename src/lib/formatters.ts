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
 * Categorías exentas de IVA (medicamentos en México).
 * Usar siempre con normalizeCategory() para comparación.
 */
export const IVA_EXEMPT_CATEGORIES = ["medicamentos", "inmunoterapia", "oncologicos"];

/**
 * Normaliza una categoría para comparación: minúsculas y sin acentos.
 * Ej: "Oncológicos" → "oncologicos"
 */
export const normalizeCategory = (cat: string | null | undefined): string =>
  (cat || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const CATEGORY_DISPLAY_MAP: Record<string, string> = {
  medicamentos: "Medicamentos",
  inmunoterapia: "Inmunoterapia",
  oncologicos: "Oncológicos",
  insumos: "Insumos",
};

/**
 * Convierte una categoría a su forma canónica para almacenamiento/visualización.
 * Mantiene el texto original para categorías no mapeadas, pero elimina espacios sobrantes.
 */
export const toCanonicalCategory = (cat: string | null | undefined): string | null => {
  const trimmed = cat?.trim();
  if (!trimmed) return null;

  const normalized = normalizeCategory(trimmed);
  return CATEGORY_DISPLAY_MAP[normalized] || trimmed;
};

/**
 * Determina si una categoría está exenta de IVA.
 */
export const isIvaExempt = (category: string | null | undefined): boolean =>
  IVA_EXEMPT_CATEGORIES.includes(normalizeCategory(category));

/**
 * Formatea el nombre del proveedor a mayúsculas
 * @param profile - Objeto con company_name y/o full_name
 * @returns Nombre del proveedor en mayúsculas o "N/A"
 */
export const formatSupplierName = (profile: { company_name?: string | null; full_name?: string | null } | null | undefined): string => {
  const name = profile?.company_name || profile?.full_name;
  return name ? name.toUpperCase() : "N/A";
};
