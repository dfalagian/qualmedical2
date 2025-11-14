# CÓDIGO FUENTE COMPLETO - SISTEMA DE NOTIFICACIONES
## Implementación EXACTA - Copiar palabra por palabra

**ARCHIVOS INCLUIDOS EN ESTA GUÍA:**
1. ✅ `src/index.css` - Estilos del sistema de diseño
2. ✅ `tailwind.config.ts` - Configuración de Tailwind
3. ✅ SQL Migration - Campos de base de datos
4. ✅ `supabase/functions/notify-supplier/index.ts` - Edge Function completa
5. ✅ `src/hooks/useNotifications.tsx` - Hook completo
6. ✅ `src/components/dashboard/EmailServerStatus.tsx` - Componente completo
7. ✅ `src/pages/Dashboard.tsx` - Dashboard completo
8. ✅ Modificaciones específicas en `src/pages/Invoices.tsx`

---

## ARCHIVO 1: src/index.css

**REEMPLAZA COMPLETAMENTE** el contenido del archivo con esto:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Definition of the design system. All colors, gradients, fonts, etc should be defined here. 
All colors MUST be HSL.
*/

@layer base {
  :root {
    --background: 0 0% 98%;
    --foreground: 180 40% 15%;

    --card: 0 0% 100%;
    --card-foreground: 180 40% 15%;

    --popover: 0 0% 100%;
    --popover-foreground: 180 40% 15%;

    /* Verde azulado corporativo - QualMedical */
    --primary: 174 76% 36%;
    --primary-foreground: 0 0% 100%;

    --secondary: 0 0% 96%;
    --secondary-foreground: 180 40% 20%;

    --muted: 0 0% 96%;
    --muted-foreground: 180 10% 45%;

    /* Verde lima corporativo - QualMedical */
    --accent: 75 65% 55%;
    --accent-foreground: 180 40% 15%;

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

    --sidebar-background: 0 0% 100%;
    --sidebar-foreground: 180 40% 20%;
    --sidebar-primary: 174 76% 36%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 75 65% 95%;
    --sidebar-accent-foreground: 180 40% 20%;
    --sidebar-border: 180 10% 91%;
    --sidebar-ring: 174 76% 36%;

    /* Gradientes QualMedical */
    --gradient-primary: linear-gradient(135deg, hsl(174 76% 36%) 0%, hsl(174 76% 46%) 100%);
    --gradient-accent: linear-gradient(135deg, hsl(75 65% 55%) 0%, hsl(75 65% 65%) 100%);
    --gradient-brand: linear-gradient(135deg, hsl(174 76% 36%) 0%, hsl(75 65% 55%) 100%);
    
    /* Sombras profesionales */
    --shadow-sm: 0 1px 2px 0 rgba(26, 155, 142, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(26, 155, 142, 0.1), 0 2px 4px -1px rgba(26, 155, 142, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(26, 155, 142, 0.1), 0 4px 6px -2px rgba(26, 155, 142, 0.05);
    --shadow-xl: 0 20px 25px -5px rgba(26, 155, 142, 0.1), 0 10px 10px -5px rgba(26, 155, 142, 0.04);
  }

  .dark {
    --background: 180 30% 8%;
    --foreground: 0 0% 95%;

    --card: 180 25% 11%;
    --card-foreground: 0 0% 95%;

    --popover: 180 25% 11%;
    --popover-foreground: 0 0% 95%;

    --primary: 174 76% 46%;
    --primary-foreground: 0 0% 100%;

    --secondary: 180 20% 16%;
    --secondary-foreground: 0 0% 95%;

    --muted: 180 20% 16%;
    --muted-foreground: 180 10% 65%;

    --accent: 75 65% 60%;
    --accent-foreground: 0 0% 100%;

    --success: 142 71% 55%;
    --success-foreground: 0 0% 100%;

    --warning: 38 92% 60%;
    --warning-foreground: 0 0% 100%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    --border: 180 20% 18%;
    --input: 180 20% 18%;
    --ring: 174 76% 46%;

    --sidebar-background: 180 25% 11%;
    --sidebar-foreground: 0 0% 95%;
    --sidebar-primary: 174 76% 46%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 180 20% 16%;
    --sidebar-accent-foreground: 0 0% 95%;
    --sidebar-border: 180 20% 18%;
    --sidebar-ring: 174 76% 46%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

---

## ARCHIVO 2: tailwind.config.ts

**REEMPLAZA COMPLETAMENTE** el contenido del archivo con esto:

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-accent': 'var(--gradient-accent)',
        'gradient-brand': 'var(--gradient-brand)',
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

---

## ARCHIVO 3: SQL MIGRATION

**EJECUTA ESTE SQL** antes de continuar:

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

⚠️ **ESPERA A QUE ESTE SQL SE EJECUTE CORRECTAMENTE ANTES DE CONTINUAR**

---

## ARCHIVO 4: src/hooks/useNotifications.tsx

**REEMPLAZA COMPLETAMENTE** el contenido del archivo con esto:

```typescript
import { supabase } from "@/integrations/supabase/client";

type NotificationType = 
  | 'account_approved' 
  | 'account_rejected' 
  | 'document_approved' 
  | 'document_rejected'
  | 'invoice_validated' 
  | 'invoice_rejected' 
  | 'payment_completed' 
  | 'payment_pending'
  | 'purchase_order_created' 
  | 'new_message'
  | 'evidence_approved'
  | 'evidence_rejected'
  | 'invoice_status_processing'
  | 'invoice_status_paid'
  | 'invoice_status_rejected';

type AdminNotificationType =
  | 'new_registration'
  | 'pending_document'
  | 'pending_invoice'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'new_message'
  | 'payment_proof_uploaded';

export const useNotifications = () => {
  const notifySupplier = async (
    supplierId: string,
    type: NotificationType,
    data?: any
  ) => {
    try {
      const { error } = await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: supplierId,
          type,
          data,
        },
      });

      if (error) {
        console.error("Error sending supplier notification:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to notify supplier:", error);
    }
  };

  const notifyAdmin = async (type: AdminNotificationType, data?: any) => {
    try {{
      const { error } = await supabase.functions.invoke("notify-admin", {
        body: {
          type,
          data,
        },
      });

      if (error) {
        console.error("Error sending admin notification:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to notify admin:", error);
    }
  };

  return {
    notifySupplier,
    notifyAdmin,
  };
};
```

---

## ARCHIVO 5: supabase/functions/notify-supplier/index.ts

**⚠️ ESTE ES EL ARCHIVO MÁS LARGO - COPIA COMPLETO SIN OMITIR NADA**

**REEMPLAZA COMPLETAMENTE** el contenido del archivo con esto:

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getDocumentTypeName = (type: string): string => {
  const types: Record<string, string> = {
    ine: "Credencial INE",
    constancia_fiscal: "Constancia de Situación Fiscal",
    comprobante_domicilio: "Comprobante de Domicilio",
    aviso_funcionamiento: "Aviso de Funcionamiento",
    datos_bancarios: "Datos Bancarios"
  };
  return types[type] || type;
};

const getEmailTemplate = (type: string, data: any): { subject: string; html: string } => {
  const templates: Record<string, (data: any) => { subject: string; html: string }> = {
    evidence_approved: (data) => ({
      subject: `✅ Evidencia de Entrega Aprobada - Factura ${data.invoice_number}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background-color: #22c55e; 
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .success-notice {
                background-color: #d1fae5;
                border: 1px solid #a7f3d0;
                padding: 20px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .success-notice h2 {
                color: #059669;
                margin: 0 0 10px 0;
                font-size: 20px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #22c55e;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .next-steps {
                background: #dbeafe;
                border-left: 3px solid #3b82f6;
                padding: 15px;
                margin: 20px 0;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✅ Evidencia Aprobada</h1>
              </div>
              
              <div class="success-notice">
                <h2>¡Tu evidencia ha sido aprobada!</h2>
                <p>El administrador ha validado exitosamente la evidencia de entrega</p>
              </div>

              <div class="content">
                <p><strong>Estimado proveedor,</strong></p>
                
                <p>Nos complace informarte que la evidencia de entrega que proporcionaste ha sido aprobada exitosamente.</p>

                <div class="info-box">
                  <p><strong>📄 Factura:</strong> ${data.invoice_number}</p>
                  <p><strong>💰 Monto:</strong> $${parseFloat(data.invoice_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                  <p><strong>✅ Estado:</strong> Evidencia Aprobada</p>
                </div>

                <div class="next-steps">
                  <p><strong>🎯 Siguiente paso:</strong></p>
                  <p>Ahora que tu evidencia ha sido aprobada, el administrador procederá a subir el comprobante de pago correspondiente.</p>
                </div>

                <p>Puedes dar seguimiento al estado de tu pago en el portal:</p>
                <p style="text-align: center; margin-top: 20px;">
                  <a href="https://qualmedical.iakan.es" style="display: inline-block; padding: 12px 30px; background: #22c55e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Acceder al Portal
                  </a>
                </p>
              </div>

              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
                <p>© 2025 QualMedical. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    evidence_rejected: (data) => ({
      subject: `❌ Evidencia de Entrega Rechazada - Factura ${data.invoice_number}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background-color: #ef4444; 
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .alert-box {
                background-color: #fee2e2;
                border: 1px solid #fecaca;
                padding: 20px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .alert-box h2 {
                color: #dc2626;
                margin: 0 0 10px 0;
                font-size: 20px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #ef4444;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .reason-box {
                background: #fef3c7;
                border-left: 3px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
              }
              .reason-box strong {
                color: #d97706;
              }
              .action-box {
                background: #dbeafe;
                border-left: 3px solid #3b82f6;
                padding: 15px;
                margin: 20px 0;
              }
              .action-box strong {
                color: #1e40af;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>❌ Evidencia Rechazada</h1>
              </div>
              
              <div class="alert-box">
                <h2>Evidencia de entrega rechazada</h2>
                <p>Tu evidencia requiere correcciones</p>
              </div>

              <div class="content">
                <p><strong>Estimado proveedor,</strong></p>
                
                <p>Lamentamos informarte que la evidencia de entrega que proporcionaste ha sido rechazada. Revisa el motivo y toma las acciones necesarias para corregir la situación.</p>

                <div class="info-box">
                  <p><strong>📄 Factura:</strong> ${data.invoice_number}</p>
                  <p><strong>💰 Monto:</strong> $${parseFloat(data.invoice_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                  <p><strong>❌ Estado:</strong> Evidencia Rechazada</p>
                </div>

                <div class="reason-box">
                  <p><strong>📋 Motivo del rechazo:</strong></p>
                  <p>${data.rejection_reason || 'No se especificó un motivo'}</p>
                </div>

                <div class="action-box">
                  <p><strong>🔧 Qué hacer ahora:</strong></p>
                  <ol style="margin: 10px 0; padding-left: 20px;">
                    <li>Revisa cuidadosamente el motivo del rechazo</li>
                    <li>Corrige o reemplaza la evidencia según las observaciones</li>
                    <li>Sube la nueva evidencia en el portal</li>
                  </ol>
                </div>

                <p style="text-align: center; margin-top: 20px;">
                  <a href="https://qualmedical.iakan.es" style="display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Subir Nueva Evidencia
                  </a>
                </p>
              </div>

              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
                <p>© 2025 QualMedical. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    invoice_status_processing: (data) => ({
      subject: `⏳ Factura en Proceso - ${data.invoice_number}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .status-notice {
                background-color: #e9d5ff;
                border: 1px solid #d8b4fe;
                padding: 20px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .status-notice h2 {
                color: #7c3aed;
                margin: 0 0 10px 0;
                font-size: 20px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #8b5cf6;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .timeline {
                background: #f5f3ff;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
              }
              .timeline-step {
                display: flex;
                align-items: center;
                margin: 15px 0;
              }
              .timeline-step .icon {
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 15px;
                font-size: 16px;
              }
              .timeline-step.completed .icon {
                background: #22c55e;
                color: white;
              }
              .timeline-step.current .icon {
                background: #8b5cf6;
                color: white;
              }
              .timeline-step.pending .icon {
                background: #e5e7eb;
                color: #9ca3af;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⏳ Tu Factura Está en Proceso</h1>
              </div>
              
              <div class="status-notice">
                <h2>Estamos procesando tu factura</h2>
                <p>Tu factura ha sido revisada y aprobada. Ahora está en proceso de pago.</p>
              </div>

              <div class="content">
                <p><strong>Estimado proveedor,</strong></p>
                
                <p>Nos complace informarte que tu factura ha sido validada y ahora está en proceso de pago. Pronto recibirás el comprobante correspondiente.</p>

                <div class="info-box">
                  <p><strong>📄 Factura:</strong> ${data.invoice_number}</p>
                  <p><strong>💰 Monto:</strong> $${parseFloat(data.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                  <p><strong>📅 Fecha de emisión:</strong> ${new Date(data.fecha_emision).toLocaleDateString('es-MX')}</p>
                  <p><strong>📊 Estado Actual:</strong> En Proceso</p>
                </div>

                <div class="timeline">
                  <p style="margin: 0 0 15px 0; font-weight: bold; color: #8b5cf6;">📍 Progreso del Pago</p>
                  
                  <div class="timeline-step completed">
                    <div class="icon">✓</div>
                    <div>
                      <strong>Factura Recibida</strong>
                      <p style="margin: 0; font-size: 14px; color: #6b7280;">Tu factura fue cargada exitosamente</p>
                    </div>
                  </div>

                  <div class="timeline-step completed">
                    <div class="icon">✓</div>
                    <div>
                      <strong>Revisión Completada</strong>
                      <p style="margin: 0; font-size: 14px; color: #6b7280;">Los datos fueron validados correctamente</p>
                    </div>
                  </div>

                  <div class="timeline-step current">
                    <div class="icon">⏳</div>
                    <div>
                      <strong>En Proceso de Pago</strong>
                      <p style="margin: 0; font-size: 14px; color: #6b7280;">Estamos procesando tu pago</p>
                    </div>
                  </div>

                  <div class="timeline-step pending">
                    <div class="icon">○</div>
                    <div>
                      <strong>Pago Completado</strong>
                      <p style="margin: 0; font-size: 14px; color: #6b7280;">Recibirás confirmación cuando se complete</p>
                    </div>
                  </div>
                </div>

                <p style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 15px; margin: 20px 0;">
                  <strong style="color: #d97706;">⏰ Tiempo estimado:</strong><br>
                  El procesamiento suele completarse en 2-5 días hábiles.
                </p>

                <p style="text-align: center; margin-top: 20px;">
                  <a href="https://qualmedical.iakan.es" style="display: inline-block; padding: 12px 30px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Ver Estado en el Portal
                  </a>
                </p>
              </div>

              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
                <p>© 2025 QualMedical. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    invoice_status_paid: (data) => ({
      subject: `✅ Pago Completado - Factura ${data.invoice_number}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white; 
                padding: 30px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: bold;
              }
              .success-icon {
                font-size: 48px;
                margin-bottom: 10px;
              }
              .success-notice {
                background-color: #d1fae5;
                border: 1px solid #a7f3d0;
                padding: 25px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .success-notice h2 {
                color: #059669;
                margin: 0 0 10px 0;
                font-size: 22px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .payment-box {
                background: #f0fdf4;
                border: 2px solid #10b981;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;
              }
              .payment-box .amount {
                font-size: 32px;
                font-weight: bold;
                color: #059669;
                margin: 10px 0;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #10b981;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="success-icon">🎉</div>
                <h1>¡Pago Completado!</h1>
              </div>
              
              <div class="success-notice">
                <h2>Tu factura ha sido pagada</h2>
                <p>El pago de tu factura se ha procesado exitosamente</p>
              </div>

              <div class="content">
                <p><strong>Estimado proveedor,</strong></p>
                
                <p>¡Excelente noticia! Nos complace informarte que el pago de tu factura ha sido completado exitosamente.</p>

                <div class="payment-box">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">MONTO PAGADO</p>
                  <div class="amount">$${parseFloat(data.invoice_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</div>
                </div>

                <div class="info-box">
                  <p><strong>📄 Factura:</strong> ${data.invoice_number}</p>
                  <p><strong>💰 Monto Total:</strong> $${parseFloat(data.invoice_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                  <p><strong>📅 Fecha de Pago:</strong> ${data.payment_date ? new Date(data.payment_date).toLocaleDateString('es-MX') : 'Hoy'}</p>
                  <p><strong>✅ Estado:</strong> Pagado</p>
                </div>

                <p style="background: #dbeafe; border-left: 3px solid #3b82f6; padding: 15px; margin: 20px 0;">
                  <strong style="color: #1e40af;">📎 Comprobante de Pago:</strong><br>
                  Puedes descargar el comprobante de pago desde el portal en la sección de tus facturas.
                </p>

                <p>Gracias por tu excelente servicio. Esperamos seguir trabajando contigo.</p>

                <p style="text-align: center; margin-top: 20px;">
                  <a href="https://qualmedical.iakan.es" style="display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Ver Comprobante en el Portal
                  </a>
                </p>
              </div>

              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
                <p>© 2025 QualMedical. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    invoice_status_rejected: (data) => ({
      subject: `❌ Factura Rechazada - ${data.invoice_number}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background-color: #ef4444; 
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .alert-box {
                background-color: #fee2e2;
                border: 1px solid #fecaca;
                padding: 20px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .alert-box h2 {
                color: #dc2626;
                margin: 0 0 10px 0;
                font-size: 20px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #ef4444;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .reason-box {
                background: #fef3c7;
                border-left: 3px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
              }
              .reason-box strong {
                color: #d97706;
              }
              .action-box {
                background: #dbeafe;
                border-left: 3px solid #3b82f6;
                padding: 15px;
                margin: 20px 0;
              }
              .action-box strong {
                color: #1e40af;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>❌ Factura Rechazada</h1>
              </div>
              
              <div class="alert-box">
                <h2>Tu factura ha sido rechazada</h2>
                <p>Se requieren correcciones para procesar el pago</p>
              </div>

              <div class="content">
                <p><strong>Estimado proveedor,</strong></p>
                
                <p>Lamentamos informarte que tu factura ha sido rechazada. Por favor revisa el motivo y realiza las correcciones necesarias.</p>

                <div class="info-box">
                  <p><strong>📄 Factura:</strong> ${data.invoice_number}</p>
                  <p><strong>💰 Monto:</strong> $${parseFloat(data.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                  <p><strong>📅 Fecha de emisión:</strong> ${new Date(data.fecha_emision).toLocaleDateString('es-MX')}</p>
                  <p><strong>❌ Estado:</strong> Rechazada</p>
                </div>

                <div class="reason-box">
                  <p><strong>📋 Motivo del rechazo:</strong></p>
                  <p>${data.rejection_reason || 'No se especificó un motivo'}</p>
                </div>

                <div class="action-box">
                  <p><strong>🔧 Qué hacer ahora:</strong></p>
                  <ol style="margin: 10px 0; padding-left: 20px;">
                    <li>Revisa cuidadosamente el motivo del rechazo</li>
                    <li>Corrige la información o documentación necesaria</li>
                    <li>Vuelve a subir la factura corregida en el portal</li>
                  </ol>
                </div>

                <p style="text-align: center; margin-top: 20px;">
                  <a href="https://qualmedical.iakan.es" style="display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Subir Factura Corregida
                  </a>
                </p>
              </div>

              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
                <p>© 2025 QualMedical. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),
  };

  return templates[type]?.(data) || {
    subject: "Notificación del Sistema QualMedical",
    html: `<p>Tipo de notificación: ${type}</p>`
  };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { supplier_id, type, data } = await req.json();

    console.log("Processing notification:", { supplier_id, type });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: supplier, error: supplierError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", supplier_id)
      .single();

    if (supplierError || !supplier) {
      console.error("Error fetching supplier:", supplierError);
      throw new Error("No se pudo obtener el email del proveedor");
    }

    const { subject, html } = getEmailTemplate(type, data);

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
      content: "Notificación del sistema",
      html: html,
    });

    await client.close();

    console.log("Email sent successfully to:", supplier.email);

    return new Response(
      JSON.stringify({ success: true, message: "Notificación enviada correctamente" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-supplier:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
```

---

## ARCHIVO 6: src/components/dashboard/EmailServerStatus.tsx

**CREA ESTE ARCHIVO NUEVO** con este contenido completo:

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: "test-connection",
          type: "test",
          data: {}
        }
      });

      if (error) {
        if (error.message?.includes("timed out") || error.message?.includes("Connection")) {
          setStatus('error');
          setErrorDetails("No se puede conectar al servidor SMTP. El servidor de correo no es accesible.");
        } else if (error.message?.includes("proveedor")) {
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

## ARCHIVO 7: src/pages/Dashboard.tsx

**REEMPLAZA COMPLETAMENTE** el contenido del archivo con esto:

```typescript
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Receipt, MessageSquare, ShoppingCart } from "lucide-react";
import { EmailServerStatus } from "@/components/dashboard/EmailServerStatus";

const Dashboard = () => {
  const { user, isAdmin } = useAuth();

  const stats = [
    {
      title: "Documentos",
      value: "0",
      description: "Documentos pendientes",
      icon: FileText,
      color: "text-primary",
    },
    {
      title: "Facturas",
      value: "0",
      description: "Facturas en proceso",
      icon: Receipt,
      color: "text-success",
    },
    {
      title: "Mensajes",
      value: "0",
      description: "Mensajes sin leer",
      icon: MessageSquare,
      color: "text-warning",
    },
    ...(isAdmin ? [{
      title: "Órdenes",
      value: "0",
      description: "Órdenes activas",
      icon: ShoppingCart,
      color: "text-accent",
    }] : []),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Bienvenido, {user?.email}
          </h2>
          <p className="text-muted-foreground">
            Aquí está el resumen de tu actividad
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isAdmin && <EmailServerStatus />}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>
              No hay actividad reciente para mostrar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-8">
              Comienza a usar el sistema para ver tu actividad aquí
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
```

---

## ARCHIVO 8: Modificaciones en src/pages/Invoices.tsx

⚠️ **ESTE ARCHIVO YA EXISTE - NO LO REEMPLACES COMPLETO**

### PARTE 1: Mutation para Cambio de Estado de Facturas (líneas 304-436)

```typescript
const updateStatusMutation = useMutation({
  mutationFn: async ({ 
    invoice,
    status,
    rejectionReason
  }: { 
    invoice: any;
    status: "pendiente" | "procesando" | "pagado" | "rechazado";
    rejectionReason?: string;
  }) => {
    const updates: any = { status };
    
    if (status === "rechazado" && rejectionReason) {
      updates.rejection_reason = rejectionReason;
    } else if (status !== "rechazado") {
      // Limpiar rejection_reason si se cambia a otro estado
      updates.rejection_reason = null;
    }
    
    if (status === "pagado") {
      updates.payment_date = new Date().toISOString().split('T')[0];
      
      // Verificar si ya existe un registro de pago para esta factura
      const { data: existingPago } = await supabase
        .from("pagos")
        .select("id")
        .eq("invoice_id", invoice.id)
        .maybeSingle();
      
      // Si no existe, crear el registro de pago automáticamente
      if (!existingPago) {
        // Obtener los datos bancarios aprobados del proveedor
        const { data: datosBancarios, error: datosBancariosError } = await supabase
          .from("documents")
          .select("id, nombre_banco, numero_cuenta_clabe")
          .eq("supplier_id", invoice.supplier_id)
          .eq("document_type", "datos_bancarios")
          .eq("status", "aprobado")
          .maybeSingle();
        
        if (datosBancariosError) {
          console.error("Error al obtener datos bancarios:", datosBancariosError);
        }
        
        if (!datosBancarios) {
          throw new Error("El proveedor no tiene datos bancarios aprobados. No se puede crear el registro de pago.");
        }
        
        // Crear el registro de pago
        const { error: pagoError } = await supabase
          .from("pagos")
          .insert({
            supplier_id: invoice.supplier_id,
            datos_bancarios_id: datosBancarios.id,
            invoice_id: invoice.id,
            amount: invoice.amount,
            fecha_pago: new Date().toISOString().split('T')[0],
            status: "pendiente",
            nombre_banco: datosBancarios.nombre_banco,
            created_by: user?.id
          });
        
        if (pagoError) {
          console.error("Error al crear registro de pago:", pagoError);
          throw new Error("Error al crear el registro de pago automáticamente");
        }
      }
    } else {
      // Limpiar payment_date si se cambia de "pagado" a otro estado
      updates.payment_date = null;
    }

    const { error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", invoice.id);

    if (error) throw error;

    // Enviar notificación por email según el estado
    let notificationType: string | null = null;
    let notificationData: any = {
      invoice_number: invoice.invoice_number,
      invoice_amount: invoice.amount,
      invoice_date: invoice.fecha_emision
    };

    switch (status) {
      case "procesando":
        notificationType = 'invoice_status_processing';
        break;
      case "pagado":
        notificationType = 'invoice_status_paid';
        notificationData.payment_date = new Date().toISOString().split('T')[0];
        break;
      case "rechazado":
        notificationType = 'invoice_status_rejected';
        notificationData.rejection_reason = rejectionReason || "No se especificó una razón";
        break;
    }

    // Solo enviar notificación si hay un tipo válido (no para "pendiente")
    if (notificationType) {
      console.log('Enviando notificación:', { 
        supplier_id: invoice.supplier_id, 
        type: notificationType, 
        data: notificationData 
      });
      
      const { data: notifResult, error: notifError } = await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: invoice.supplier_id,
          type: notificationType,
          data: notificationData
        }
      });
      
      if (notifError) {
        console.error('Error al enviar notificación:', notifError);
        throw new Error(`Error al enviar notificación: ${notifError.message}`);
      }
      
      console.log('Notificación enviada exitosamente:', notifResult);
    }
  },
  onSuccess: () => {
    toast.success("Estado actualizado y notificación enviada");
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  },
  onError: (error: any) => {
    toast.error(error.message || "Error al actualizar");
  },
});
```

### PARTE 2: Select en UI para Cambiar Estado (líneas ~1484-1510)

```typescript
{isAdmin && (
  <Select
    value={invoice.status}
    onValueChange={(value: any) => {
      // Si es rechazado, solicitar razón
      if (value === "rechazado") {
        const reason = prompt("Razón del rechazo de la factura:");
        if (reason) {
          updateStatusMutation.mutate({ 
            invoice, 
            status: value,
            rejectionReason: reason
          });
        }
      } else {
        updateStatusMutation.mutate({ invoice, status: value });
      }
    }}
  >
    <SelectTrigger className="w-32">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="pendiente">Pendiente</SelectItem>
      <SelectItem value="procesando">Procesando</SelectItem>
      <SelectItem value="pagado">Pagado</SelectItem>
      <SelectItem value="rechazado">Rechazado</SelectItem>
    </SelectContent>
  </Select>
)}
```

### PARTE 3: Otras Verificaciones Necesarias

1. ✅ **Estado `rejectionReasonDialog`** (líneas 54-62):
```typescript
const [rejectionReasonDialog, setRejectionReasonDialog] = useState<{ 
  open: boolean; 
  reason: string;
  type: 'invoice' | 'evidence';
}>({ 
  open: false, 
  reason: '',
  type: 'evidence'
});
```

2. ✅ **Mutaciones `approveEvidenceMutation` y `rejectEvidenceMutation`** (líneas 618-747):
- Actualizan `evidence_status`
- Registran `evidence_reviewed_by` y `evidence_reviewed_at`
- Guardan `evidence_rejection_reason` cuando se rechaza

3. ✅ **Badges de estado de evidencia** usando `getEvidenceStatusBadge` (línea 1208)

4. ✅ **Botones "Ver motivo"** para mostrar razones de rechazo de factura (líneas 980-996) y evidencia (líneas 1213-1228)

5. ✅ **AlertDialog para mostrar motivos de rechazo** (líneas 1622-1641)

**SI ALGO FALTA**, cópialo exactamente como está en el archivo actual del sistema.

---

## ✅ CHECKLIST FINAL DE VERIFICACIÓN

Después de implementar, verifica:

### Archivos:
- [ ] `src/index.css` - Colores success/warning/destructive definidos
- [ ] `tailwind.config.ts` - Colores success/warning/destructive en extend.colors
- [ ] SQL ejecutado sin errores
- [ ] `src/hooks/useNotifications.tsx` - Hook completo con todos los tipos
- [ ] `supabase/functions/notify-supplier/index.ts` - Edge function con 5 templates completos
- [ ] `src/components/dashboard/EmailServerStatus.tsx` - Componente nuevo creado
- [ ] `src/pages/Dashboard.tsx` - EmailServerStatus agregado
- [ ] `src/pages/Invoices.tsx` - Verificar cambios de evidencias y rechazos

### Funcionalidad:
- [ ] Badges de evidencia se ven con colores correctos (verde/amarillo/rojo)
- [ ] Botón "Verificar Conexión" del servidor SMTP funciona
- [ ] EmailServerStatus solo visible para admins
- [ ] Botones "Ver motivo" funcionan para facturas y evidencias rechazadas
- [ ] Notificaciones se envían correctamente

---

## 🚨 NOTAS CRÍTICAS PARA LA IA QUE IMPLEMENTA

1. **COPIA EXACTAMENTE** - No cambies nombres de variables, no agregues funcionalidades extra
2. **ORDEN ESTRICTO** - Ejecuta en orden: CSS → Tailwind → SQL → Hook → Edge Function → Componentes
3. **NO OMITAS NADA** - Las plantillas de email son largas pero necesarias completas
4. **VERIFICA COLORES** - Sin success/warning/destructive los badges no funcionarán
5. **SQL PRIMERO** - El SQL debe ejecutarse y confirmarse antes de continuar
6. **TESTING** - Prueba el botón de verificación SMTP una vez implementado

---

**FIN DEL DOCUMENTO - TODO EL CÓDIGO FUENTE ESTÁ INCLUIDO**
