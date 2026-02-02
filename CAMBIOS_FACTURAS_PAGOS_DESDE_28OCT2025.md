# Cambios en Sección Facturas y Pagos
## Desde el 28 de Octubre 2025

---

## 📋 Resumen Ejecutivo

Este documento detalla los cambios implementados en las secciones de **Facturas** y **Pagos** del sistema, excluyendo funcionalidades de inventario, catálogo de medicamentos externos y órdenes de compra.

---

## 1. VALIDACIÓN DE FACTURAS XML

### 1.1 Corrección del Cálculo de Total con Retenciones de ISR

**Archivo:** `src/lib/invoiceTotals.ts`

**Problema resuelto:** Las facturas con retenciones de ISR mostraban un total incorrecto porque las retenciones no se restaban del monto a pagar.

**Fórmula implementada:**
```
Total = Subtotal - Descuento + Traslados - Retenciones
```

**Código completo:**
```typescript
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
```

### 1.2 Extracción de Impuestos desde XML (Edge Function)

**Archivo:** `supabase/functions/validate-invoice-xml/index.ts`

**Mejoras implementadas:**

1. **Extracción de retenciones de ISR e IVA retenido** desde el bloque consolidado `<cfdi:Impuestos>` del XML
2. **Almacenamiento estructurado** de impuestos en formato JSON:
```typescript
const impuestosDetalle: any = {
  traslados: [],    // IVA trasladado, IEPS, etc.
  retenciones: []   // ISR retenido, IVA retenido
};
```

3. **Lógica de fallback** cuando no existe bloque consolidado:
   - Suma automática de impuestos por tipo cuando el XML no tiene el bloque `<cfdi:Impuestos>` principal

4. **Validaciones implementadas:**
   - RFC del receptor debe ser `QME240321HF3` (QualMedical)
   - Si `FormaPago = 99`, entonces `MetodoPago` debe ser `PPD`
   - Detección de CFDIs tipo "P" (Pago) para evitar confusión

---

## 2. SISTEMA DE COMPROBANTES DE PAGO MÚLTIPLES

### 2.1 Historial de Pagos con Eliminación

**Archivo:** `src/components/payments/PaymentProofsHistory.tsx`

**Funcionalidades implementadas:**

1. **Visualización de historial de pagos** por factura
2. **Botón de eliminación** (solo para administradores) con ícono de papelera
3. **Confirmación antes de eliminar** mediante AlertDialog
4. **Sincronización automática** de totales al eliminar:
   - Actualiza `paid_amount` en tabla `pagos`
   - Actualiza `status` de `pagos` (pendiente/parcial/pagado)
   - Actualiza `status` de `invoices`

**Fragmento clave de eliminación:**
```typescript
const deleteMutation = useMutation({
  mutationFn: async (proof: PaymentProof) => {
    // Eliminar el comprobante
    const { error: deleteError } = await supabase
      .from("payment_proofs")
      .delete()
      .eq("id", proof.id);

    if (deleteError) throw deleteError;

    // Actualizar el paid_amount en pagos
    const { data: currentPago, error: pagoError } = await supabase
      .from("pagos")
      .select("paid_amount, original_amount")
      .eq("id", pagoId)
      .single();

    if (pagoError) throw pagoError;

    const newPaidAmount = Math.max(0, (currentPago.paid_amount || 0) - Number(proof.amount));
    const newStatus = newPaidAmount <= 0 ? "pendiente" : 
                      newPaidAmount >= (currentPago.original_amount || 0) ? "pagado" : "parcial";

    const { error: updateError } = await supabase
      .from("pagos")
      .update({ 
        paid_amount: newPaidAmount,
        status: newStatus
      })
      .eq("id", pagoId);

    if (updateError) throw updateError;

    // Actualizar estado de factura
    const invoiceStatus = newPaidAmount <= 0 ? "pendiente" : 
                         newPaidAmount >= (currentPago.original_amount || 0) ? "pagado" : "procesando";
    
    await supabase
      .from("invoices")
      .update({ status: invoiceStatus })
      .eq("id", proofData?.invoice_id);

    return { newPaidAmount };
  },
  onSuccess: () => {
    toast.success("Comprobante eliminado correctamente");
    queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
    queryClient.invalidateQueries({ queryKey: ["pagos"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  },
});
```

### 2.2 Visualización de Comprobantes para Proveedores

**Archivo:** `src/components/invoices/InvoicePaymentProofUpload.tsx`

**Funcionalidades para proveedores:**

1. **Vista de solo lectura** de comprobantes de pago subidos
2. **Visualización de imágenes** con URL firmada
3. **Resumen de pagos:**
   - Total de factura
   - Total pagado
   - Pendiente por pagar

**Fragmento de UI para proveedores:**
```tsx
{!isAdmin ? (
  <div className="space-y-4">
    {paymentProofs && paymentProofs.length > 0 ? (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Haz clic en un comprobante para verlo:</p>
        {paymentProofs.map((proof: any) => (
          <div 
            key={proof.id}
            className="flex justify-between items-center p-3 bg-muted/30 rounded-lg hover:bg-muted/50 cursor-pointer"
            onClick={() => handleViewProof(proof.comprobante_url)}
          >
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-green-600" />
              <Badge variant="outline">Pago #{proof.proof_number}</Badge>
            </div>
            <span className="font-semibold text-green-600">
              {formatCurrency(Number(proof.amount))}
            </span>
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Receipt className="h-12 w-12 mb-4 opacity-50" />
        <p>Aún no hay comprobantes de pago registrados</p>
      </div>
    )}
  </div>
) : (
  // Vista de administrador para subir comprobantes
  ...
)}
```

---

## 3. SECCIÓN DE PAGOS - CORRECCIONES

### 3.1 Visualización Individual de Comprobantes

**Archivo:** `src/pages/Payments.tsx`

**Cambios implementados:**

1. **Cada comprobante como fila separada** en la tabla de pagos
2. **Columnas incluidas:**
   - Número de pago (`Pago #1`, `Pago #2`, etc.)
   - Importe del pago
   - Fecha de pago
   - Estado (pagado/pendiente)
   - Remanente por pagar

3. **Cálculo de remanente** automático:
```typescript
const calculateRemanente = (pago: any): string => {
  const totalFactura = parseFloat(pago.invoice_amount || pago.invoices?.amount || 0);
  const importePago = parseFloat(pago.amount || 0);
  
  if (pago.is_proof || pago.is_pending_remainder) {
    if (pago.is_pending_remainder) {
      return ""; // El resto pendiente no tiene remanente
    }
    const remanente = totalFactura - (pago.accumulated_paid || importePago);
    return remanente > 0.01 ? formatCurrency(remanente) : "0";
  }
  
  return "";
};
```

### 3.2 Exportación a Excel Mejorada

**Columnas del Excel:**
- Proveedor
- RFC
- Régimen Fiscal
- Nombre Banco
- Cliente Bancario
- Número de Cuenta
- CLABE
- Fecha Emisión Factura
- Número de Factura
- Importe Total Factura
- **Número de Pago** (nuevo)
- Importe Pago
- **Remanente x pagar** (nuevo)
- Estado Pago
- Fecha Pago
- Fecha Creación

---

## 4. RESTRICCIONES DE ACCESO

### 4.1 Carga de Comprobantes Solo para Administradores

**Implementación:**
```typescript
const { isAdmin } = useAuth();

// Botón de carga solo visible para admins
{isAdmin && (
  <Button onClick={handleUpload}>
    Subir Comprobante
  </Button>
)}

// Proveedores solo pueden ver los comprobantes
{!isAdmin && (
  <div>Vista de solo lectura de comprobantes</div>
)}
```

### 4.2 Eliminación de Comprobantes Solo para Administradores

```tsx
{isAdmin && (
  <Button
    variant="ghost"
    size="icon"
    className="opacity-0 group-hover:opacity-100 text-destructive"
    onClick={(e) => handleDeleteClick(e, proof)}
  >
    <Trash2 className="h-3.5 w-3.5" />
  </Button>
)}
```

---

## 5. TABLAS DE BASE DE DATOS AFECTADAS

### 5.1 Tabla `payment_proofs`
```sql
- id (uuid)
- pago_id (uuid) -- FK a pagos
- invoice_id (uuid) -- FK a invoices
- proof_number (integer) -- Número secuencial del comprobante
- amount (numeric) -- Monto del comprobante
- fecha_pago (date) -- Fecha extraída del comprobante
- comprobante_url (text) -- URL del archivo
- created_at, created_by
```

### 5.2 Tabla `pagos`
```sql
- paid_amount (numeric) -- Total acumulado de comprobantes
- original_amount (numeric) -- Monto original de la factura
- status (text) -- pendiente/parcial/pagado
```

### 5.3 Tabla `invoices`
```sql
- impuestos_detalle (jsonb) -- Traslados y retenciones desglosados
- status (enum) -- pendiente/procesando/pagado/rechazado/cancelado
```

---

## 6. FLUJO DE TRABAJO ACTUALIZADO

### Para Administradores:
1. Verificar evidencia de entrega (status = "aprobado")
2. Subir comprobante de pago (imagen o PDF)
3. Sistema extrae automáticamente: fecha y monto
4. Sistema valida datos bancarios vs comprobante
5. Si el pago es parcial, puede subir más comprobantes
6. Puede eliminar comprobantes si hay error

### Para Proveedores:
1. Ver facturas subidas
2. Ver estado de cada factura
3. Ver comprobantes de pago subidos por admin (solo lectura)
4. Ver resumen: total factura, pagado, pendiente
5. Subir complemento de pago cuando corresponda

---

## 7. DEPENDENCIAS UTILIZADAS

```json
{
  "@tanstack/react-query": "^5.83.0",
  "lucide-react": "^0.462.0",
  "sonner": "^1.7.4"
}
```

---

## 8. ARCHIVOS MODIFICADOS

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `src/lib/invoiceTotals.ts` | Nuevo | Cálculo centralizado de totales |
| `src/components/payments/PaymentProofsHistory.tsx` | Modificado | Agregado eliminación de comprobantes |
| `src/components/invoices/InvoicePaymentProofUpload.tsx` | Modificado | Vista para proveedores |
| `src/pages/Payments.tsx` | Modificado | Filas individuales por comprobante |
| `src/pages/Invoices.tsx` | Modificado | Uso de calculateInvoiceTotal |
| `supabase/functions/validate-invoice-xml/index.ts` | Modificado | Extracción de retenciones |
| `supabase/functions/extract-payment-proof-info/index.ts` | Modificado | Soporte múltiples comprobantes |

---

*Documento generado el 2 de febrero de 2026*
