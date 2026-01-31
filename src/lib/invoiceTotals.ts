type AnyRecord = Record<string, any>;

type ImpuestosDetalle = {
  traslados?: Array<{ importe?: number | string | null }>;
  retenciones?: Array<{ importe?: number | string | null }>;
};

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function parseImpuestosDetalle(impuestos_detalle: unknown): ImpuestosDetalle | null {
  if (!impuestos_detalle) return null;
  if (typeof impuestos_detalle === "string") {
    try {
      return JSON.parse(impuestos_detalle) as ImpuestosDetalle;
    } catch {
      return null;
    }
  }
  if (typeof impuestos_detalle === "object") return impuestos_detalle as ImpuestosDetalle;
  return null;
}

/**
 * Total pagadero de factura = Subtotal - Descuento + Traslados - Retenciones.
 * NOTA: Retenciones (ISR/IVA retenido) NO son "pendiente"; se restan del total.
 */
export function calculateInvoiceTotal(invoice: AnyRecord): number {
  const subtotal = safeNumber(invoice?.subtotal ?? invoice?.amount);
  const descuento = safeNumber(invoice?.descuento);

  const impuestos = parseImpuestosDetalle(invoice?.impuestos_detalle);

  const totalTrasladosFromDetalle = impuestos?.traslados?.reduce(
    (sum, t) => sum + safeNumber(t?.importe),
    0
  );

  // Fallback por compatibilidad con registros viejos donde solo existía total_impuestos
  const totalTraslados =
    totalTrasladosFromDetalle !== undefined ? totalTrasladosFromDetalle : safeNumber(invoice?.total_impuestos);

  const totalRetenciones = impuestos?.retenciones?.reduce(
    (sum, r) => sum + safeNumber(r?.importe),
    0
  ) ?? 0;

  const total = subtotal - descuento + totalTraslados - totalRetenciones;
  return Number.isFinite(total) ? total : 0;
}
