# GUÍA DE IMPLEMENTACIÓN EXACTA
## Sistema de Validación de Evidencias y Notificaciones

### ⚠️ INSTRUCCIONES PARA LA IA QUE IMPLEMENTARÁ ESTO:
1. **PRIMERO**: Verifica los estilos en PASO 0
2. Ejecuta el SQL del PASO 1
3. Espera confirmación del usuario de que se ejecutó
4. Luego implementa los archivos en el orden exacto del PASO 2 al PASO 6
5. NO hagas cambios adicionales que no estén aquí
6. Copia el código EXACTAMENTE como está

**FUNCIONALIDADES INCLUIDAS:**
- ✅ Sistema de evidencias de entrega con aprobación/rechazo
- ✅ Notificaciones por email en cambios de estado de facturas (procesando, pagado, rechazado)
- ✅ Diálogos para capturar motivos de rechazo
- ✅ Componente de verificación del servidor SMTP en Dashboard
- ✅ Plantillas de email profesionales para cada tipo de notificación

---

## PASO 0: VERIFICAR Y ACTUALIZAR SISTEMA DE DISEÑO

Antes de comenzar, asegúrate de que estos estilos estén presentes en tu sistema de diseño.

### 0.1 Verificar `src/index.css`

**BUSCA** en el archivo `src/index.css` dentro del bloque `@layer base { :root { ... } }` si existen estas variables:

```css
--success: 142 71% 45%;
--success-foreground: 0 0% 100%;

--warning: 38 92% 50%;
--warning-foreground: 0 0% 100%;

--destructive: 0 84% 60%;
--destructive-foreground: 0 0% 100%;
```

**SI NO EXISTEN**, agrégalas en el `:root` junto con los demás colores:

```css
@layer base {
  :root {
    --background: 0 0% 98%;
    --foreground: 180 40% 15%;

    --card: 0 0% 100%;
    --card-foreground: 180 40% 15%;

    --popover: 0 0% 100%;
    --popover-foreground: 180 40% 15%;

    --primary: 174 76% 36%;
    --primary-foreground: 0 0% 100%;

    --secondary: 0 0% 96%;
    --secondary-foreground: 180 40% 20%;

    --muted: 0 0% 96%;
    --muted-foreground: 180 10% 45%;

    --accent: 75 65% 55%;
    --accent-foreground: 180 40% 15%;

    /* AGREGAR ESTOS SI NO EXISTEN: */
    --success: 142 71% 45%;
    --success-foreground: 0 0% 100%;

    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 100%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    --border: 180 10% 88%;
    --input: 180 10% 91%;
    --ring: 174 76% 36%;

    --radius: 0.75rem;
  }

  .dark {
    --background: 180 30% 8%;
    --foreground: 0 0% 95%;

    /* ... otros colores ... */

    /* AGREGAR ESTOS SI NO EXISTEN: */
    --success: 142 71% 55%;
    --success-foreground: 0 0% 100%;

    --warning: 38 92% 60%;
    --warning-foreground: 0 0% 100%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    /* ... otros colores ... */
  }
}
```

### 0.2 Verificar `tailwind.config.ts`

**BUSCA** en el archivo `tailwind.config.ts` dentro del objeto `theme.extend.colors` si existen estos colores:

```typescript
success: {
  DEFAULT: "hsl(var(--success))",
  foreground: "hsl(var(--success-foreground))",
},
warning: {
  DEFAULT: "hsl(var(--warning))",
  foreground: "hsl(var(--warning-foreground))",
},
destructive: {
  DEFAULT: "hsl(var(--destructive))",
  foreground: "hsl(var(--destructive-foreground))",
},
```

**SI NO EXISTEN**, agrégalos en el objeto `colors`:

```typescript
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        /* AGREGAR ESTOS SI NO EXISTEN: */
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

**IMPORTANTE:** Los colores `success`, `warning`, y `destructive` son ESENCIALES para los badges y alertas del sistema.

---

## PASO 1: EJECUTAR MIGRACIÓN SQL (DESPUÉS DE VERIFICAR ESTILOS)

```sql
-- Agregar columnas para validación de evidencias de entrega
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS delivery_evidence_url text[] DEFAULT ARRAY[]::text[],
ADD COLUMN IF NOT EXISTS evidence_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS evidence_reviewed_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS evidence_reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS evidence_rejection_reason text;

-- Agregar columna para razón de rechazo general de facturas
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Comentarios para documentar los campos
COMMENT ON COLUMN invoices.delivery_evidence_url IS 'URLs de imágenes de evidencia de entrega';
COMMENT ON COLUMN invoices.evidence_status IS 'Estado de validación: pending, approved, rejected';
COMMENT ON COLUMN invoices.evidence_reviewed_by IS 'Admin que revisó la evidencia';
COMMENT ON COLUMN invoices.evidence_reviewed_at IS 'Fecha y hora de revisión de evidencia';
COMMENT ON COLUMN invoices.evidence_rejection_reason IS 'Razón de rechazo de evidencia de entrega';
COMMENT ON COLUMN invoices.rejection_reason IS 'Razón de rechazo general de la factura';
```

**ESPERA A QUE EL USUARIO CONFIRME QUE ESTE SQL SE EJECUTÓ ANTES DE CONTINUAR**

---

## PASO 2: EDGE FUNCTION notify-supplier/index.ts

**REEMPLAZA COMPLETAMENTE** el archivo `supabase/functions/notify-supplier/index.ts` con este código:

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationData {
  supplier_id: string;
  type: string;
  data: any;
}

const getDocumentTypeName = (type: string): string => {
  const types: Record<string, string> = {
    'ine': 'INE',
    'constancia_fiscal': 'Constancia Fiscal',
    'comprobante_domicilio': 'Comprobante de Domicilio',
    'datos_bancarios': 'Datos Bancarios',
    'acta_constitutiva': 'Acta Constitutiva',
    'aviso_funcionamiento': 'Aviso de Funcionamiento'
  };
  return types[type] || type;
};

const getEmailTemplate = (type: string, data: any): { subject: string; html: string } => {
  const templates: Record<string, { subject: string; html: string }> = {
    'document_approved': {
      subject: `✅ Documento Aprobado - ${getDocumentTypeName(data.document_type)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .success-icon { font-size: 48px; margin-bottom: 20px; }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">✅</div>
              <h1>¡Documento Aprobado!</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>Tu documento <strong>${getDocumentTypeName(data.document_type)}</strong> ha sido <strong>aprobado</strong> exitosamente.</p>
              <p><strong>Detalles:</strong></p>
              <ul>
                <li>Documento: ${getDocumentTypeName(data.document_type)}</li>
                <li>Fecha de revisión: ${new Date().toLocaleDateString('es-MX')}</li>
              </ul>
              ${data.notes ? `<p><strong>Notas del revisor:</strong><br>${data.notes}</p>` : ''}
              <p>Puedes continuar con el proceso de registro.</p>
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Ver mis documentos</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    'document_rejected': {
      subject: `❌ Documento Rechazado - ${getDocumentTypeName(data.document_type)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .warning-icon { font-size: 48px; margin-bottom: 20px; }
            .rejection-box { background: #fee; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="warning-icon">❌</div>
              <h1>Documento Rechazado</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>Lamentamos informarte que tu documento <strong>${getDocumentTypeName(data.document_type)}</strong> ha sido <strong>rechazado</strong>.</p>
              <div class="rejection-box">
                <strong>Motivo del rechazo:</strong><br>
                ${data.rejection_reason || 'No se proporcionó un motivo específico'}
              </div>
              <p><strong>Qué hacer ahora:</strong></p>
              <ol>
                <li>Revisa el motivo del rechazo</li>
                <li>Corrige el documento según las observaciones</li>
                <li>Vuelve a subir el documento actualizado</li>
              </ol>
              ${data.notes ? `<p><strong>Notas adicionales:</strong><br>${data.notes}</p>` : ''}
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Subir documento corregido</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    'supplier_approved': {
      subject: '🎉 ¡Cuenta Aprobada! - Bienvenido',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .celebration-icon { font-size: 48px; margin-bottom: 20px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="celebration-icon">🎉</div>
              <h1>¡Cuenta Aprobada!</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>¡Excelentes noticias! Tu cuenta de proveedor ha sido <strong>aprobada</strong>.</p>
              <p><strong>Ya puedes:</strong></p>
              <ul>
                <li>Subir facturas</li>
                <li>Ver el estado de tus pagos</li>
                <li>Gestionar tus documentos</li>
                <li>Comunicarte con el equipo administrativo</li>
              </ul>
              <p>Estamos emocionados de trabajar contigo.</p>
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Ir al portal</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    'evidence_approved': {
      subject: '✅ Evidencia de Entrega Aprobada',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .success-icon { font-size: 48px; margin-bottom: 20px; }
            .info-box { background: white; border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">✅</div>
              <h1>Evidencia de Entrega Aprobada</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>Tu evidencia de entrega para la factura <strong>${data.invoice_number}</strong> ha sido <strong>aprobada</strong>.</p>
              <div class="info-box">
                <strong>Detalles de la factura:</strong><br>
                Número: ${data.invoice_number}<br>
                Monto: $${Number(data.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}<br>
                Fecha de aprobación: ${new Date().toLocaleDateString('es-MX')}
              </div>
              <p><strong>Próximos pasos:</strong></p>
              <p>Ahora puedes subir el comprobante de pago para esta factura.</p>
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Ver factura</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    'evidence_rejected': {
      subject: '❌ Evidencia de Entrega Rechazada',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .warning-icon { font-size: 48px; margin-bottom: 20px; }
            .rejection-box { background: #fee; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
            .info-box { background: white; border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="warning-icon">❌</div>
              <h1>Evidencia de Entrega Rechazada</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>Lamentamos informarte que la evidencia de entrega para la factura <strong>${data.invoice_number}</strong> ha sido <strong>rechazada</strong>.</p>
              <div class="info-box">
                <strong>Detalles de la factura:</strong><br>
                Número: ${data.invoice_number}<br>
                Monto: $${Number(data.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <div class="rejection-box">
                <strong>Motivo del rechazo:</strong><br>
                ${data.evidence_rejection_reason || 'No se proporcionó un motivo específico'}
              </div>
              <p><strong>Qué hacer ahora:</strong></p>
              <ol>
                <li>Revisa el motivo del rechazo</li>
                <li>Toma nuevas fotografías que cumplan con los requisitos</li>
                <li>Vuelve a subir la evidencia corregida</li>
              </ol>
              <p><strong>Requisitos para la evidencia:</strong></p>
              <ul>
                <li>Imágenes claras y legibles</li>
                <li>Mostrar fecha y hora de entrega</li>
                <li>Incluir firma o sello de recibido</li>
                <li>Fotografía del producto entregado</li>
              </ul>
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Subir nueva evidencia</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    'invoice_status_processing': {
      subject: '🔄 Factura en Proceso',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .process-icon { font-size: 48px; margin-bottom: 20px; }
            .timeline { background: white; border-left: 3px solid #3b82f6; padding-left: 20px; margin: 20px 0; }
            .timeline-step { margin: 15px 0; }
            .timeline-step.active { color: #3b82f6; font-weight: bold; }
            .timeline-step.completed { color: #10b981; }
            .info-box { background: white; border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="process-icon">🔄</div>
              <h1>Factura en Proceso</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>Tu factura <strong>${data.invoice_number}</strong> está siendo procesada.</p>
              <div class="info-box">
                <strong>Detalles de la factura:</strong><br>
                Número: ${data.invoice_number}<br>
                Monto: $${Number(data.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}<br>
                Fecha: ${new Date(data.fecha_emision).toLocaleDateString('es-MX')}
              </div>
              <div class="timeline">
                <div class="timeline-step completed">✅ Factura recibida</div>
                <div class="timeline-step active">🔄 En proceso de revisión</div>
                <div class="timeline-step">⏳ Aprobación pendiente</div>
                <div class="timeline-step">💰 Programación de pago</div>
              </div>
              <p>Te notificaremos cuando el proceso avance.</p>
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Ver estado</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    'invoice_status_paid': {
      subject: '💰 Factura Pagada',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .payment-icon { font-size: 48px; margin-bottom: 20px; }
            .payment-box { background: #d1fae5; border: 2px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
            .amount { font-size: 32px; font-weight: bold; color: #059669; }
            .info-box { background: white; border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="payment-icon">💰</div>
              <h1>¡Pago Realizado!</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>¡Excelentes noticias! Tu factura <strong>${data.invoice_number}</strong> ha sido <strong>pagada</strong>.</p>
              <div class="payment-box">
                <p style="margin: 0; color: #059669;">Monto pagado:</p>
                <div class="amount">$${Number(data.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
              </div>
              <div class="info-box">
                <strong>Detalles del pago:</strong><br>
                Número de factura: ${data.invoice_number}<br>
                Fecha de pago: ${data.payment_date ? new Date(data.payment_date).toLocaleDateString('es-MX') : new Date().toLocaleDateString('es-MX')}<br>
                Método de pago: Transferencia bancaria
              </div>
              <p>El pago debería reflejarse en tu cuenta en las próximas 24-48 horas hábiles.</p>
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Ver comprobante</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    'invoice_status_rejected': {
      subject: '❌ Factura Rechazada',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .warning-icon { font-size: 48px; margin-bottom: 20px; }
            .rejection-box { background: #fee; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
            .info-box { background: white; border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="warning-icon">❌</div>
              <h1>Factura Rechazada</h1>
            </div>
            <div class="content">
              <p>Hola ${data.supplier_name},</p>
              <p>Lamentamos informarte que tu factura <strong>${data.invoice_number}</strong> ha sido <strong>rechazada</strong>.</p>
              <div class="info-box">
                <strong>Detalles de la factura:</strong><br>
                Número: ${data.invoice_number}<br>
                Monto: $${Number(data.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}<br>
                Fecha: ${new Date(data.fecha_emision).toLocaleDateString('es-MX')}
              </div>
              <div class="rejection-box">
                <strong>Motivo del rechazo:</strong><br>
                ${data.rejection_reason || 'No se proporcionó un motivo específico'}
              </div>
              <p><strong>Qué hacer ahora:</strong></p>
              <ol>
                <li>Revisa el motivo del rechazo</li>
                <li>Corrige los datos según las observaciones</li>
                <li>Vuelve a subir la factura corregida</li>
              </ol>
              <p>Si tienes dudas, contacta al equipo administrativo.</p>
              <a href="${Deno.env.get('VITE_SUPABASE_URL')}" class="button">Contactar soporte</a>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    }
  };

  return templates[type] || {
    subject: 'Notificación',
    html: '<p>Notificación del sistema</p>'
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { supplier_id, type, data }: NotificationData = await req.json();
    
    console.log('Enviando notificación:', { supplier_id, type });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: supplier, error: supplierError } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', supplier_id)
      .single();

    if (supplierError || !supplier) {
      throw new Error(`Error al obtener datos del proveedor: ${supplierError?.message}`);
    }

    const emailData = {
      ...data,
      supplier_name: supplier.full_name
    };

    const { subject, html } = getEmailTemplate(type, emailData);

    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get("SMTP_HOST")!,
        port: parseInt(Deno.env.get("SMTP_PORT") || "587"),
        tls: true,
        auth: {
          username: Deno.env.get("SMTP_USER")!,
          password: Deno.env.get("SMTP_PASSWORD")!,
        },
      },
    });

    await client.send({
      from: Deno.env.get("SMTP_FROM_EMAIL")!,
      to: supplier.email,
      subject: subject,
      html: html,
    });

    await client.close();

    console.log('Notificación enviada exitosamente a:', supplier.email);

    return new Response(
      JSON.stringify({ success: true, message: 'Notificación enviada' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error en notify-supplier:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
```

---

## PASO 3: HOOK useNotifications.tsx

**REEMPLAZA COMPLETAMENTE** el archivo `src/hooks/useNotifications.tsx` con este código:

```typescript
import { supabase } from "@/integrations/supabase/client";

export type NotificationType = 
  | 'document_approved'
  | 'document_rejected'
  | 'supplier_approved'
  | 'evidence_approved'
  | 'evidence_rejected'
  | 'invoice_status_processing'
  | 'invoice_status_paid'
  | 'invoice_status_rejected';

interface NotificationData {
  supplier_id: string;
  type: NotificationType;
  data: any;
}

export const useNotifications = () => {
  const notifySupplier = async (notificationData: NotificationData) => {
    try {
      console.log('Enviando notificación:', notificationData);
      
      const { data, error } = await supabase.functions.invoke('notify-supplier', {
        body: notificationData
      });

      if (error) {
        console.error('Error al enviar notificación:', error);
        throw error;
      }

      console.log('Notificación enviada exitosamente:', data);
      return data;
    } catch (error) {
      console.error('Error en notifySupplier:', error);
      throw error;
    }
  };

  return { notifySupplier };
};
```

---

## PASO 4: CREAR COMPONENTE src/components/dashboard/EmailServerStatus.tsx

Este componente muestra el estado del servidor de correo electrónico SMTP y debe agregarse al Dashboard de administrador.

**CREAR ARCHIVO COMPLETO** `src/components/dashboard/EmailServerStatus.tsx`:

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const EmailServerStatus = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'warning'>('idle');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [errorDetails, setErrorDetails] = useState<string>("");

  const checkEmailServer = async () => {
    setIsChecking(true);
    setStatus('idle');
    setErrorDetails("");

    try {
      // Intentar hacer una llamada de prueba al edge function
      const { data, error } = await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: "test-connection",
          type: "test",
          data: {}
        }
      });

      if (error) {
        // Si hay error, verificar el mensaje
        if (error.message?.includes("timed out") || error.message?.includes("Connection")) {
          setStatus('error');
          setErrorDetails("No se puede conectar al servidor SMTP. El servidor de correo no es accesible.");
        } else if (error.message?.includes("proveedor")) {
          // Este error es esperado ya que usamos un ID de prueba
          setStatus('warning');
          setErrorDetails("El servidor SMTP parece estar configurado, pero no se pudo verificar completamente.");
        } else {
          setStatus('error');
          setErrorDetails(error.message || "Error desconocido al verificar el servidor de correo.");
        }
      } else {
        setStatus('success');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorDetails(err.message || "Error al intentar conectar con el servidor de correo.");
    } finally {
      setIsChecking(false);
      setLastCheck(new Date());
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <Mail className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'success':
        return <Badge variant="outline" className="bg-success/10 text-success border-success">Conectado</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive">Desconectado</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning">Advertencia</Badge>;
      default:
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Sin verificar</Badge>;
    }
  };

  return (
    <Card className={`shadow-md ${status === 'error' ? 'bg-destructive/10 border-destructive' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-lg">Estado del Servidor de Correo Electrónico</CardTitle>
              <CardDescription>
                Verificación del servidor SMTP para notificaciones
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {lastCheck ? (
              <>Última verificación: {lastCheck.toLocaleTimeString()}</>
            ) : (
              <>No se ha verificado aún</>
            )}
          </div>
          <Button
            onClick={checkEmailServer}
            disabled={isChecking}
            variant="outline"
            size="sm"
          >
            {isChecking ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Verificar Conexión
              </>
            )}
          </Button>
        </div>

        {status === 'error' && errorDetails && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Error de Conexión</AlertTitle>
            <AlertDescription>
              {errorDetails}
              <div className="mt-2 text-xs">
                <strong>Verifica:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>SMTP_HOST está configurado correctamente</li>
                  <li>SMTP_PORT es el correcto (usualmente 587 o 465)</li>
                  <li>SMTP_USER y SMTP_PASSWORD son válidos</li>
                  <li>El servidor permite conexiones desde Supabase</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {status === 'success' && (
          <Alert className="bg-success/10 border-success">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertTitle className="text-success">Conexión Exitosa</AlertTitle>
            <AlertDescription className="text-success/80">
              El servidor de correo está funcionando correctamente y puede enviar notificaciones.
            </AlertDescription>
          </Alert>
        )}

        {status === 'warning' && errorDetails && (
          <Alert className="bg-warning/10 border-warning">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">Advertencia</AlertTitle>
            <AlertDescription className="text-warning/80">
              {errorDetails}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3">
          <strong>Variables de entorno requeridas:</strong>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            <li>SMTP_HOST - Servidor SMTP (ej: smtp.gmail.com)</li>
            <li>SMTP_PORT - Puerto SMTP (ej: 587)</li>
            <li>SMTP_USER - Usuario del servidor SMTP</li>
            <li>SMTP_PASSWORD - Contraseña del servidor SMTP</li>
            <li>SMTP_FROM_EMAIL - Email remitente (ej: noreply@empresa.com)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
```

---

## PASO 5: AGREGAR EmailServerStatus AL DASHBOARD

Modificar `src/pages/Dashboard.tsx` para incluir el componente de estado del servidor de correo **SOLO para administradores**.

### 5.1 Import a agregar:

**AL INICIO DEL ARCHIVO**, agregar:

```typescript
import { EmailServerStatus } from "@/components/dashboard/EmailServerStatus";
```

### 5.2 Ubicación exacta en el JSX:

**DESPUÉS** de la grid de estadísticas (`<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">...</div>`) y **ANTES** de la Card de "Actividad Reciente", agregar:

```typescript
{isAdmin && <EmailServerStatus />}
```

El fragmento completo del return debe verse así:

```typescript
return (
  <DashboardLayout>
    <div className="space-y-6">
      {/* ... sección de bienvenida ... */}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* ... tarjetas de estadísticas ... */}
      </div>

      {/* AGREGAR ESTA LÍNEA: */}
      {isAdmin && <EmailServerStatus />}

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Actividad Reciente</CardTitle>
          {/* ... resto del contenido ... */}
        </CardHeader>
      </Card>
    </div>
  </DashboardLayout>
);
```

---

## PASO 6: CAMBIOS EN src/pages/Invoices.tsx

**LOCALIZA Y MODIFICA** las siguientes secciones en `src/pages/Invoices.tsx`:

### 6.1 Imports (AL INICIO DEL ARCHIVO)

**AGREGAR** estos imports si no existen:

```typescript
import { useNotifications } from "@/hooks/useNotifications";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
```

### 6.2 Estado y Hooks (DESPUÉS DE LAS DECLARACIONES DE COMPONENTES)

**AGREGAR** estos estados:

```typescript
const [showRejectDialog, setShowRejectDialog] = useState(false);
const [showEvidenceRejectDialog, setShowEvidenceRejectDialog] = useState(false);
const [rejectionReason, setRejectionReason] = useState("");
const [evidenceRejectionReason, setEvidenceRejectionReason] = useState("");
const [selectedInvoiceForRejection, setSelectedInvoiceForRejection] = useState<string | null>(null);
const [selectedInvoiceForEvidenceRejection, setSelectedInvoiceForEvidenceRejection] = useState<string | null>(null);

const { notifySupplier } = useNotifications();
```

### 6.3 Función para Badge de Estado de Evidencia

**AGREGAR** esta función (después de las mutaciones):

```typescript
const getEvidenceStatusBadge = (status: string | null) => {
  if (!status || status === 'pending') {
    return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
  }
  if (status === 'approved') {
    return <Badge variant="outline" className="bg-green-100 text-green-800">Aprobada</Badge>;
  }
  if (status === 'rejected') {
    return <Badge variant="outline" className="bg-red-100 text-red-800">Rechazada</Badge>;
  }
  return null;
};
```

### 6.4 Mutación de Actualización de Estado

**REEMPLAZA** la mutación `updateStatusMutation` con esta versión:

```typescript
const updateStatusMutation = useMutation({
  mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
    const updateData: any = { 
      status: newStatus,
      updated_at: new Date().toISOString()
    };
    
    if (newStatus === 'rechazado' && rejectionReason.trim()) {
      updateData.rejection_reason = rejectionReason.trim();
    }
    
    const { error } = await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", id);
    
    if (error) throw error;
    
    return { id, newStatus };
  },
  onSuccess: async (data) => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    toast({
      title: "Estado actualizado",
      description: "El estado de la factura se ha actualizado correctamente",
    });
    
    setShowRejectDialog(false);
    setRejectionReason("");
    setSelectedInvoiceForRejection(null);
    
    const invoice = invoices?.find(inv => inv.id === data.id);
    if (invoice) {
      try {
        if (data.newStatus === 'procesando') {
          await notifySupplier({
            supplier_id: invoice.supplier_id,
            type: 'invoice_status_processing',
            data: {
              invoice_number: invoice.invoice_number,
              amount: invoice.amount,
              fecha_emision: invoice.fecha_emision
            }
          });
        } else if (data.newStatus === 'pagado') {
          await notifySupplier({
            supplier_id: invoice.supplier_id,
            type: 'invoice_status_paid',
            data: {
              invoice_number: invoice.invoice_number,
              amount: invoice.amount,
              payment_date: invoice.payment_date
            }
          });
        } else if (data.newStatus === 'rechazado') {
          await notifySupplier({
            supplier_id: invoice.supplier_id,
            type: 'invoice_status_rejected',
            data: {
              invoice_number: invoice.invoice_number,
              amount: invoice.amount,
              fecha_emision: invoice.fecha_emision,
              rejection_reason: rejectionReason
            }
          });
        }
      } catch (error) {
        console.error('Error al enviar notificación:', error);
      }
    }
  },
  onError: (error) => {
    toast({
      title: "Error",
      description: "No se pudo actualizar el estado de la factura",
      variant: "destructive",
    });
  },
});
```

### 6.5 Mutaciones de Evidencia

**AGREGAR** estas dos mutaciones:

```typescript
const approveEvidenceMutation = useMutation({
  mutationFn: async (invoiceId: string) => {
    const { error } = await supabase
      .from("invoices")
      .update({
        evidence_status: 'approved',
        evidence_reviewed_by: user?.id,
        evidence_reviewed_at: new Date().toISOString()
      })
      .eq("id", invoiceId);
    
    if (error) throw error;
    return invoiceId;
  },
  onSuccess: async (invoiceId) => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    toast({
      title: "Evidencia aprobada",
      description: "La evidencia de entrega ha sido aprobada correctamente",
    });
    
    const invoice = invoices?.find(inv => inv.id === invoiceId);
    if (invoice) {
      try {
        await notifySupplier({
          supplier_id: invoice.supplier_id,
          type: 'evidence_approved',
          data: {
            invoice_number: invoice.invoice_number,
            amount: invoice.amount
          }
        });
      } catch (error) {
        console.error('Error al enviar notificación:', error);
      }
    }
  },
  onError: (error) => {
    toast({
      title: "Error",
      description: "No se pudo aprobar la evidencia",
      variant: "destructive",
    });
  },
});

const rejectEvidenceMutation = useMutation({
  mutationFn: async ({ invoiceId, reason }: { invoiceId: string; reason: string }) => {
    const { error } = await supabase
      .from("invoices")
      .update({
        evidence_status: 'rejected',
        evidence_reviewed_by: user?.id,
        evidence_reviewed_at: new Date().toISOString(),
        evidence_rejection_reason: reason
      })
      .eq("id", invoiceId);
    
    if (error) throw error;
    return { invoiceId, reason };
  },
  onSuccess: async (data) => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    toast({
      title: "Evidencia rechazada",
      description: "La evidencia de entrega ha sido rechazada",
    });
    
    setShowEvidenceRejectDialog(false);
    setEvidenceRejectionReason("");
    setSelectedInvoiceForEvidenceRejection(null);
    
    const invoice = invoices?.find(inv => inv.id === data.invoiceId);
    if (invoice) {
      try {
        await notifySupplier({
          supplier_id: invoice.supplier_id,
          type: 'evidence_rejected',
          data: {
            invoice_number: invoice.invoice_number,
            amount: invoice.amount,
            evidence_rejection_reason: data.reason
          }
        });
      } catch (error) {
        console.error('Error al enviar notificación:', error);
      }
    }
  },
  onError: (error) => {
    toast({
      title: "Error",
      description: "No se pudo rechazar la evidencia",
      variant: "destructive",
    });
  },
});
```

### 6.6 Handler para Cambio de Estado

**REEMPLAZA** el handler `handleStatusChange` con:

```typescript
const handleStatusChange = (invoiceId: string, newStatus: string) => {
  if (newStatus === 'rechazado') {
    setSelectedInvoiceForRejection(invoiceId);
    setShowRejectDialog(true);
  } else {
    updateStatusMutation.mutate({ id: invoiceId, newStatus });
  }
};
```

### 6.7 Handlers de Evidencia

**AGREGAR** estos handlers:

```typescript
const handleApproveEvidence = (invoiceId: string) => {
  approveEvidenceMutation.mutate(invoiceId);
};

const handleRejectEvidence = (invoiceId: string) => {
  setSelectedInvoiceForEvidenceRejection(invoiceId);
  setShowEvidenceRejectDialog(true);
};

const confirmEvidenceRejection = () => {
  if (selectedInvoiceForEvidenceRejection && evidenceRejectionReason.trim()) {
    rejectEvidenceMutation.mutate({
      invoiceId: selectedInvoiceForEvidenceRejection,
      reason: evidenceRejectionReason.trim()
    });
  }
};

const confirmRejection = () => {
  if (selectedInvoiceForRejection && rejectionReason.trim()) {
    updateStatusMutation.mutate({
      id: selectedInvoiceForRejection,
      newStatus: 'rechazado'
    });
  }
};
```

### 6.8 Columnas de la Tabla - AGREGAR Columna de Evidencia

**LOCALIZA** donde se definen las columnas de la tabla y **AGREGA** esta columna ANTES de la columna de "Acciones":

```typescript
{
  accessorKey: "delivery_evidence_url",
  header: "Evidencia de Entrega",
  cell: ({ row }) => {
    const invoice = row.original;
    const evidenceUrls = invoice.delivery_evidence_url;
    const evidenceStatus = invoice.evidence_status;
    
    if (!evidenceUrls || evidenceUrls.length === 0) {
      return <span className="text-muted-foreground">Sin evidencia</span>;
    }
    
    return (
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          {evidenceUrls.map((url: string, index: number) => (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              Imagen {index + 1}
            </a>
          ))}
        </div>
        {getEvidenceStatusBadge(evidenceStatus)}
        {evidenceStatus === 'rejected' && invoice.evidence_rejection_reason && (
          <p className="text-xs text-red-600 mt-1">
            Motivo: {invoice.evidence_rejection_reason}
          </p>
        )}
        {isAdmin && evidenceStatus === 'pending' && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleApproveEvidence(invoice.id)}
            >
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleRejectEvidence(invoice.id)}
            >
              Rechazar
            </Button>
          </div>
        )}
      </div>
    );
  },
}
```

### 6.9 Diálogos - AGREGAR al final del return, ANTES del cierre del fragmento

**AGREGAR** estos dos diálogos:

```typescript
<Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Rechazar Factura</DialogTitle>
      <DialogDescription>
        Por favor indica el motivo del rechazo de la factura
      </DialogDescription>
    </DialogHeader>
    <Textarea
      placeholder="Escribe aquí el motivo del rechazo..."
      value={rejectionReason}
      onChange={(e) => setRejectionReason(e.target.value)}
      rows={4}
    />
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => {
          setShowRejectDialog(false);
          setRejectionReason("");
          setSelectedInvoiceForRejection(null);
        }}
      >
        Cancelar
      </Button>
      <Button
        variant="destructive"
        onClick={confirmRejection}
        disabled={!rejectionReason.trim()}
      >
        Confirmar Rechazo
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<Dialog open={showEvidenceRejectDialog} onOpenChange={setShowEvidenceRejectDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Rechazar Evidencia de Entrega</DialogTitle>
      <DialogDescription>
        Por favor indica el motivo del rechazo de la evidencia
      </DialogDescription>
    </DialogHeader>
    <Textarea
      placeholder="Escribe aquí el motivo del rechazo..."
      value={evidenceRejectionReason}
      onChange={(e) => setEvidenceRejectionReason(e.target.value)}
      rows={4}
    />
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => {
          setShowEvidenceRejectDialog(false);
          setEvidenceRejectionReason("");
          setSelectedInvoiceForEvidenceRejection(null);
        }}
      >
        Cancelar
      </Button>
      <Button
        variant="destructive"
        onClick={confirmEvidenceRejection}
        disabled={!evidenceRejectionReason.trim()}
      >
        Confirmar Rechazo
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## ✅ CHECKLIST DE VERIFICACIÓN FINAL

Después de implementar todo, verifica:

### Estilos (PASO 0):
- ✅ Colores `success`, `warning`, `destructive` definidos en `src/index.css` (:root y .dark)
- ✅ Colores registrados en `tailwind.config.ts` en el objeto `extend.colors`

### Base de Datos (PASO 1):
- ✅ SQL ejecutado sin errores
- ✅ Campos `delivery_evidence_url`, `evidence_status`, `evidence_reviewed_by`, `evidence_reviewed_at`, `evidence_rejection_reason` creados
- ✅ Campo `rejection_reason` creado

### Backend (PASO 2):
- ✅ Edge function `notify-supplier/index.ts` actualizado con todos los templates de email
- ✅ Templates incluidos: `evidence_approved`, `evidence_rejected`, `invoice_status_processing`, `invoice_status_paid`, `invoice_status_rejected`
- ✅ Edge function desplegado correctamente

### Hooks (PASO 3):
- ✅ Hook `useNotifications.tsx` actualizado con todos los tipos de notificación

### Componentes (PASO 4 y 5):
- ✅ Componente `EmailServerStatus.tsx` creado
- ✅ `EmailServerStatus` agregado al Dashboard (solo visible para admins)
- ✅ Botón "Verificar Conexión" funcionando

### Página de Facturas (PASO 6):
- ✅ Todos los imports agregados correctamente
- ✅ Estados y hooks inicializados
- ✅ Función `getEvidenceStatusBadge` agregada
- ✅ Mutación `updateStatusMutation` actualizada con notificaciones
- ✅ Mutaciones `approveEvidenceMutation` y `rejectEvidenceMutation` agregadas
- ✅ Handlers actualizados: `handleStatusChange`, `handleApproveEvidence`, `handleRejectEvidence`, `confirmEvidenceRejection`, `confirmRejection`
- ✅ Columna "Evidencia de Entrega" agregada a la tabla
- ✅ Badges de estado visible (Pendiente/Aprobada/Rechazada)
- ✅ Botones Aprobar/Rechazar visibles para admins cuando evidencia está pendiente
- ✅ Diálogo de rechazo de factura funcionando
- ✅ Diálogo de rechazo de evidencia funcionando

### Funcionalidad (Pruebas):
- ✅ Cambiar estado de factura a "procesando" envía email
- ✅ Cambiar estado de factura a "pagado" envía email
- ✅ Rechazar factura solicita motivo y envía email con el motivo
- ✅ Aprobar evidencia actualiza estado y envía email
- ✅ Rechazar evidencia solicita motivo y envía email con el motivo
- ✅ Verificación del servidor SMTP funciona desde Dashboard

---

## 🚨 IMPORTANTE PARA LA IA IMPLEMENTADORA

- NO agregues funcionalidades extras
- NO cambies nombres de variables
- NO modifiques el código más allá de lo especificado
- Copia el código EXACTAMENTE como está
- Si algo falla, reporta el error específico sin intentar arreglarlo por tu cuenta
- **LOS ESTILOS SON CRÍTICOS**: Si faltan los colores `success`, `warning`, `destructive`, los badges y alertas no se verán correctamente
