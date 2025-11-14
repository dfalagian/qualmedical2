# Cambios Complementarios en Base de Datos - Tabla invoices

## ⚠️ IMPORTANTE
Este documento complementa los informes anteriores. Estos campos adicionales deben crearse en la tabla `invoices` para que todas las funcionalidades trabajen correctamente.

---

## Campos Adicionales Requeridos

### 1. Campo para Rechazo General de Facturas

Este campo es necesario para el **Sistema de Rechazo de Facturas con Notificaciones**.

```sql
-- Agregar campo para motivo de rechazo de facturas
ALTER TABLE invoices 
ADD COLUMN rejection_reason TEXT;

-- Agregar comentario
COMMENT ON COLUMN invoices.rejection_reason IS 'Razón por la cual se rechazó la factura (cuando status = rechazada)';
```

**Uso:**
- Se guarda cuando el administrador rechaza una factura completa (no solo las evidencias)
- Se usa en el template de email `invoice_status_rejected` del edge function `notify-supplier`
- Se muestra en el email enviado al proveedor explicando por qué se rechazó su factura

---

### 2. Campo para URLs de Evidencias de Entrega

Este campo permite almacenar múltiples URLs de imágenes de evidencias de entrega.

```sql
-- Agregar campo para evidencias de entrega (array de URLs)
ALTER TABLE invoices 
ADD COLUMN delivery_evidence_url TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Agregar comentario
COMMENT ON COLUMN invoices.delivery_evidence_url IS 'Array de URLs de las imágenes de evidencia de entrega subidas por el proveedor';
```

**Uso:**
- Los proveedores suben fotos de la entrega de medicamentos
- Se almacenan como un array de URLs (permite múltiples imágenes)
- El administrador revisa estas evidencias y las aprueba/rechaza usando los campos de `evidence_status`, `evidence_reviewed_by`, `evidence_reviewed_at`, y `evidence_rejection_reason`

---

## Resumen de Todos los Campos Relacionados con Evidencias

Para referencia completa, estos son **TODOS** los campos relacionados con evidencias y rechazo en la tabla `invoices`:

```sql
-- Campos para evidencias de entrega
delivery_evidence_url TEXT[] DEFAULT ARRAY[]::TEXT[],           -- URLs de las imágenes
evidence_status TEXT DEFAULT 'pending',                         -- Estado: pending, approved, rejected
evidence_reviewed_by UUID REFERENCES auth.users(id),            -- Quién revisó
evidence_reviewed_at TIMESTAMP WITH TIME ZONE,                  -- Cuándo revisó
evidence_rejection_reason TEXT,                                 -- Por qué rechazó las evidencias

-- Campo para rechazo de factura completa
rejection_reason TEXT                                           -- Por qué rechazó la factura
```

---

## Verificación de Campos

Antes de ejecutar estos comandos SQL, verifica si los campos ya existen en tu base de datos:

```sql
-- Verificar si los campos existen
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'invoices' 
  AND column_name IN ('rejection_reason', 'delivery_evidence_url', 'evidence_status', 
                      'evidence_reviewed_by', 'evidence_reviewed_at', 'evidence_rejection_reason')
ORDER BY column_name;
```

---

## Orden de Implementación Recomendado

1. **Primero**: Crear los campos de evidencias (del informe SISTEMA_VALIDACION_EVIDENCIAS.md):
   - `evidence_status`
   - `evidence_reviewed_by`
   - `evidence_reviewed_at`
   - `evidence_rejection_reason`

2. **Segundo**: Crear el campo de array para las imágenes:
   - `delivery_evidence_url`

3. **Tercero**: Crear el campo de rechazo general:
   - `rejection_reason`

---

## Notas Importantes

- **`evidence_rejection_reason`** vs **`rejection_reason`**: 
  - `evidence_rejection_reason`: Por qué se rechazaron las fotos/evidencias de entrega
  - `rejection_reason`: Por qué se rechazó la factura completa (problema en datos, XML, validación, etc.)

- **Default values**: 
  - `evidence_status` debe tener default `'pending'`
  - `delivery_evidence_url` debe tener default `ARRAY[]::TEXT[]`

- **Tipos de datos**:
  - `delivery_evidence_url` es un array de texto (`TEXT[]`)
  - `rejection_reason` y `evidence_rejection_reason` son texto simple (`TEXT`)
  - `evidence_status` es texto con valores restringidos (`TEXT` con CHECK o ENUM)

---

## Ejemplo de Comando Completo

Si quieres crear todos los campos de una sola vez:

```sql
-- Crear todos los campos relacionados con evidencias y rechazo
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS delivery_evidence_url TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS evidence_status TEXT DEFAULT 'pending' CHECK (evidence_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS evidence_reviewed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS evidence_reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS evidence_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Agregar comentarios descriptivos
COMMENT ON COLUMN invoices.delivery_evidence_url IS 'Array de URLs de las imágenes de evidencia de entrega subidas por el proveedor';
COMMENT ON COLUMN invoices.evidence_status IS 'Estado de validación de las evidencias de entrega: pending, approved, rejected';
COMMENT ON COLUMN invoices.evidence_reviewed_by IS 'ID del administrador que revisó las evidencias';
COMMENT ON COLUMN invoices.evidence_reviewed_at IS 'Fecha y hora de la revisión de evidencias';
COMMENT ON COLUMN invoices.evidence_rejection_reason IS 'Razón del rechazo de las evidencias de entrega';
COMMENT ON COLUMN invoices.rejection_reason IS 'Razón por la cual se rechazó la factura completa';
```

---

## Políticas RLS (Row Level Security)

Asegúrate de que las políticas RLS existentes permitan a los proveedores actualizar el campo `delivery_evidence_url`:

```sql
-- Verificar que existe esta política (ya debería estar creada)
-- Los proveedores pueden actualizar evidencia de entrega
CREATE POLICY IF NOT EXISTS "Los proveedores pueden actualizar evidencia de entrega"
ON invoices
FOR UPDATE
USING (auth.uid() = supplier_id)
WITH CHECK (auth.uid() = supplier_id);
```

Esta política permite que los proveedores suban sus evidencias de entrega.

---

## Integración con Frontend

Una vez creados estos campos, el frontend usa:

1. **`InvoicePaymentProofUpload.tsx`**: Componente para que proveedores suban evidencias
2. **`Invoices.tsx`**: Mutations para aprobar/rechazar evidencias por admin
3. **`useNotifications.tsx`**: Hook para enviar notificaciones por email
4. **Edge function `notify-supplier`**: Envía emails con los templates correspondientes
