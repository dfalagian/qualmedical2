# ANÁLISIS DE FUNCIONALIDADES FALTANTES EN QUALMEDICAL
## Comparación con CITIO

**Fecha de Análisis**: Noviembre 2025  
**Proyecto Base**: QualMedical  
**Proyecto de Referencia**: CITIO

---

## RESUMEN EJECUTIVO

Después de analizar el documento completo de CITIO, se identificaron **15 funcionalidades principales** que están presentes en CITIO pero faltan en QualMedical. Este documento detalla cada una de ellas con prioridad de implementación y complejidad técnica.

---

## FUNCIONALIDADES FALTANTES

### 🔴 ALTA PRIORIDAD

#### 1. **Sistema de Versiones de Documentos**
**Estado**: ❌ No existe en QualMedical

**Descripción**:
- Tabla `document_versions` que guarda historial completo de cambios
- Trigger automático `handle_document_version()` que guarda versión anterior al actualizar
- Incremento automático del número de versión
- Historial inmutable (no se puede modificar/eliminar)

**Componentes necesarios**:
```sql
CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  version integer NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  status document_status NOT NULL,
  notes text,
  created_at timestamp DEFAULT now()
);

CREATE TRIGGER on_document_updated
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION handle_document_version();
```

**Beneficio**: Auditoría completa y trazabilidad de cambios en documentos.

**Complejidad**: Media (3-4 horas)

---

#### 2. **Extracción de Impuestos Detallados en Facturas**
**Estado**: ❌ No existe en QualMedical

**Descripción**:
- Campo `impuestos_detalle` JSONB en tabla `invoices`
- Extracción completa de traslados (IVA, IEPS) y retenciones (ISR)
- Detalle de base, tasa/cuota, importe por cada impuesto

**Estructura del campo**:
```typescript
impuestos_detalle: {
  traslados: [
    {
      impuesto: "002", // IVA
      tipo_factor: "Tasa",
      tasa_o_cuota: "0.160000",
      base: 1000.00,
      importe: 160.00
    }
  ],
  retenciones: [
    {
      impuesto: "001", // ISR
      importe: 50.00
    }
  ]
}
```

**Cambios necesarios**:
1. Agregar campo `impuestos_detalle JSONB DEFAULT '{}'::jsonb` a tabla `invoices`
2. Modificar edge function `validate-invoice-xml` para extraer impuestos detallados
3. Actualizar componente `InvoiceDetailsDialog` para mostrar desglose

**Beneficio**: Análisis fiscal detallado y cumplimiento normativo mejorado.

**Complejidad**: Alta (6-8 horas)

---

#### 3. **Conversión Automática PDF a Imágenes**
**Estado**: ❌ No existe sistemáticamente en QualMedical

**Descripción**:
- Todos los documentos PDF se convierten automáticamente a imágenes PNG
- Campo `image_urls text[]` ya existe en tabla `documents`
- Usa librería `pdfjs-dist` v5.4.296
- Facilita revisión visual sin descargar PDF

**Cambios necesarios**:
1. Verificar que el hook `usePDFUpload` esté siendo usado consistentemente
2. Actualizar todas las páginas de subida de documentos para usar conversión
3. Implementar visor de imágenes en páginas de admin

**Beneficio**: Mejor UX para administradores en revisión de documentos.

**Complejidad**: Media (4-5 horas)

---

#### 4. **Sistema de Aprobación de Proveedores**
**Estado**: ❌ No existe en QualMedical

**Descripción**:
- Campo `approved boolean DEFAULT false` en tabla `profiles`
- Nuevos proveedores no pueden operar hasta ser aprobados por admin
- Validación en RLS policies y frontend

**Cambios necesarios**:
1. Agregar campo `approved` a tabla `profiles`
2. Crear componente de aprobación en panel admin
3. Actualizar RLS policies para verificar aprobación
4. Hook `useSupplierApproval` para manejar aprobación/rechazo

**Beneficio**: Control de acceso y validación de nuevos proveedores.

**Complejidad**: Media (3-4 horas)

---

#### 5. **Extracción de Datos Bancarios de Comprobantes**
**Estado**: ⚠️ Parcial - Falta `tipo_cuenta`

**Descripción**:
- Campo `tipo_cuenta text` en tabla `pagos`
- Extracción con IA de: "Cheques", "Débito", "Crédito", etc.

**Cambios necesarios**:
1. Agregar campo `tipo_cuenta` a tabla `pagos`
2. Actualizar edge function `extract-payment-proof-info` para extraer tipo de cuenta
3. Mostrar en UI de pagos

**Beneficio**: Información bancaria más completa.

**Complejidad**: Baja (2-3 horas)

---

### 🟡 MEDIA PRIORIDAD

#### 6. **Módulo de Órdenes de Compra**
**Estado**: ❌ No existe en QualMedical

**Descripción**:
- Tabla completa `purchase_orders`
- Admin crea órdenes asignadas a proveedores
- Proveedores pueden ver sus órdenes (solo lectura)
- Seguimiento de estado: pendiente, completado, cancelado

**Componentes necesarios**:
```sql
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL,
  order_number text NOT NULL,
  amount numeric NOT NULL,
  currency text DEFAULT 'MXN',
  description text,
  status text DEFAULT 'pendiente',
  created_by uuid,
  created_at timestamp,
  updated_at timestamp
);
```

**Páginas necesarias**:
- `/purchase-orders` - Vista proveedor
- Sección en `/admin` para gestión

**Beneficio**: Control y seguimiento de órdenes de compra.

**Complejidad**: Alta (8-10 horas)

---

#### 7. **Sistema de Mensajería Interno**
**Estado**: ✅ Tabla `messages` existe - ❌ Falta implementación completa

**Descripción**:
- Comunicación bidireccional admin-proveedor
- Marcado de leído/no leído
- Búsqueda y filtros
- Notificaciones opcionales

**Cambios necesarios**:
1. Página `/messages` ya existe, verificar funcionalidad completa
2. Implementar búsqueda y filtros
3. Agregar contador de mensajes no leídos en header
4. Opcional: notificaciones en tiempo real con Supabase Realtime

**Beneficio**: Comunicación centralizada en la plataforma.

**Complejidad**: Media (5-6 horas)

---

#### 8. **Edge Functions de Gestión de Usuarios**
**Estado**: ✅ `create-user` y `delete-user` ya existen

**Descripción**: Ya implementados en QualMedical

**Cambios necesarios**: Ninguno

**Complejidad**: N/A

---

#### 9. **Notificaciones por Email**
**Estado**: ❌ No existe en QualMedical

**Descripción**:
- Edge function `send-supplier-notification`
- Envío de emails vía SMTP
- Notificaciones de aprobación, rechazos, pagos, etc.

**Secrets necesarios**:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `ADMIN_EMAIL`

**Cambios necesarios**:
1. Crear edge function `send-supplier-notification`
2. Crear edge function `test-email` para pruebas
3. Configurar secrets de SMTP
4. Integrar en flujos de aprobación/rechazo

**Beneficio**: Comunicación proactiva con proveedores.

**Complejidad**: Media (4-5 horas)

---

#### 10. **Módulo de Respaldo de Base de Datos**
**Estado**: ✅ Página `/database-backup` ya existe

**Descripción**:
- Exportación de todas las tablas a Excel
- Edge function `export-database-schema` para exportar DDL

**Cambios necesarios**:
1. Crear edge function `export-database-schema`
2. Agregar botón en página existente para exportar schema

**Beneficio**: Respaldo completo y portabilidad de datos.

**Complejidad**: Baja (2-3 horas)

---

### 🟢 BAJA PRIORIDAD

#### 11. **Contador de Medicinas con IA** (ÚNICO DE CITIO)
**Estado**: ❌ No existe en QualMedical

**Descripción**:
- Funcionalidad completamente única de CITIO
- Usa visión por computadora para contar cajas/unidades
- Tabla `medicine_counts` para registros
- Edge function `count-medicine-boxes`

**Aplicabilidad**: Depende si QualMedical maneja inventario de medicamentos

**Componentes necesarios** (si aplica):
1. Tabla `medicine_counts`
2. Edge function `count-medicine-boxes`
3. Página `/medicine-counter`
4. RLS policies específicas

**Beneficio**: Automatización de conteo de inventario.

**Complejidad**: Alta (10-12 horas)

**Recomendación**: Evaluar si esta funcionalidad aplica al negocio de QualMedical

---

#### 12. **Documentos Adicionales**
**Estado**: ⚠️ QualMedical tiene 3 tipos, CITIO tiene 5

**Tipos en CITIO**:
1. INE ✅
2. Constancia Fiscal ✅
3. Comprobante de Domicilio ✅
4. Datos Bancarios ✅
5. Aviso de Funcionamiento ❌

**Cambios necesarios** (si aplica):
1. Agregar tipo 'aviso_funcionamiento' al enum `document_type`
2. Actualizar edge function `extract-document-info` con nuevos campos
3. Crear página `/aviso-funcionamiento-admin`

**Complejidad**: Media (3-4 horas por tipo)

---

#### 13. **Múltiples Evidencias de Entrega**
**Estado**: ⚠️ QualMedical usa array pero puede estar limitado

**Descripción**:
- CITIO permite subir múltiples evidencias sin límite definido
- Campo `delivery_evidence_url text[]` en ambos sistemas

**Cambios necesarios**:
1. Verificar límites en componente de subida
2. Permitir agregar múltiples evidencias
3. Galería de visualización de todas las evidencias

**Complejidad**: Baja (2-3 horas)

---

#### 14. **Validación RFC Específico en Facturas**
**Estado**: ⚠️ Depende de configuración

**Descripción**:
- CITIO valida que `receptor_rfc === "CIT241205P67"`
- QualMedical debería validar con RFC de QualMedical

**Cambios necesarios**:
1. Obtener RFC oficial de QualMedical
2. Actualizar edge function `validate-invoice-xml`
3. Agregar validación del RFC receptor

**Complejidad**: Muy baja (1 hora)

---

#### 15. **Campos Adicionales en Facturas**
**Estado**: ⚠️ Revisar si existen todos

**Campos en CITIO que podrían faltar**:
- `requiere_complemento boolean` ✅ Existe
- `complemento_pago_url text` ✅ Existe
- `lugar_expedicion text` ✅ Existe
- `receptor_uso_cfdi text` ✅ Existe

**Cambios necesarios**: Verificar en schema actual

---

## PLAN DE IMPLEMENTACIÓN SUGERIDO

### Fase 1: Funcionalidades Críticas (1-2 semanas)
1. Sistema de versiones de documentos
2. Extracción de impuestos detallados
3. Sistema de aprobación de proveedores
4. Conversión automática PDF a imágenes
5. Validación RFC específico

### Fase 2: Mejoras Operativas (1 semana)
6. Extracción de tipo de cuenta bancaria
7. Módulo de órdenes de compra
8. Notificaciones por email
9. Módulo de respaldo completo

### Fase 3: Optimizaciones (3-5 días)
10. Múltiples evidencias de entrega
11. Documentos adicionales (si aplica)
12. Mejoras en mensajería

### Fase 4: Funcionalidades Opcionales (Evaluar necesidad)
13. Contador de medicinas con IA

---

## ESTIMACIÓN TOTAL

- **Tiempo mínimo** (sin contador de medicinas): 35-45 horas
- **Tiempo máximo** (con todas las funcionalidades): 45-57 horas
- **Tiempo estimado realista**: 40-50 horas

---

## DEPENDENCIAS TÉCNICAS

### Librerías adicionales necesarias:
- ✅ `pdfjs-dist` v5.4.296 - Ya instalada
- ✅ `xlsx` v0.18.5 - Ya instalada
- Todas las demás dependencias ya están presentes

### Secrets adicionales necesarios:
- ❌ `SMTP_HOST` - Para notificaciones email
- ❌ `SMTP_PORT` - Para notificaciones email
- ❌ `SMTP_USER` - Para notificaciones email
- ❌ `SMTP_PASSWORD` - Para notificaciones email
- ❌ `ADMIN_EMAIL` - Para notificaciones email

---

## RECOMENDACIONES FINALES

1. **Priorizar**: Implementar primero las funcionalidades de Alta Prioridad
2. **Evaluar necesidad**: El contador de medicinas con IA es único de CITIO y debe evaluarse si aplica
3. **Migración gradual**: Implementar en fases para no afectar producción
4. **Testing exhaustivo**: Especialmente en triggers y RLS policies
5. **Documentación**: Mantener documentación actualizada de cambios

---

## COMPATIBILIDAD

Todas las funcionalidades propuestas son compatibles con:
- ✅ React 18.3.1
- ✅ Supabase/Lovable Cloud
- ✅ Stack actual de QualMedical
- ✅ Edge Functions (Deno)
- ✅ Lovable AI Gateway

---

**Documento generado**: 14 de Noviembre 2025  
**Próximo paso**: Revisión y aprobación de funcionalidades a implementar
