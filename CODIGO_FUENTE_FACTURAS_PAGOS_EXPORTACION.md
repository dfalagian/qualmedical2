# Código Fuente Completo - Sistema de Facturas y Pagos
## Guía de Implementación para Proyecto Clone

---

## 📋 ÍNDICE

1. [Base de Datos - Migraciones SQL](#1-base-de-datos---migraciones-sql)
2. [Registro de Proveedores - AuthForm](#2-registro-de-proveedores---authform)
3. [Librería de Cálculo de Totales](#3-librería-de-cálculo-de-totales)
4. [Edge Function: validate-invoice-xml](#4-edge-function-validate-invoice-xml)
5. [Edge Function: extract-payment-proof-info](#5-edge-function-extract-payment-proof-info)
6. [Componente: PaymentProofsHistory](#6-componente-paymentproofshistory)
7. [Componente: InvoicePaymentProofUpload](#7-componente-invoicepaymentproofupload)
8. [Página: Payments.tsx](#8-página-paymentstsx)
9. [Dependencias Requeridas](#9-dependencias-requeridas)

---

## 1. BASE DE DATOS - MIGRACIONES SQL

### 1.1 Tabla payment_proofs

```sql
-- Tabla para almacenar múltiples comprobantes de pago por factura
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id UUID NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  proof_number INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL,
  fecha_pago DATE,
  comprobante_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX idx_payment_proofs_pago_id ON public.payment_proofs(pago_id);
CREATE INDEX idx_payment_proofs_invoice_id ON public.payment_proofs(invoice_id);

-- Habilitar RLS
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Los admins pueden ver todos los comprobantes"
ON public.payment_proofs FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden insertar comprobantes"
ON public.payment_proofs FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden actualizar comprobantes"
ON public.payment_proofs FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Los admins pueden eliminar comprobantes"
ON public.payment_proofs FOR DELETE
USING (is_admin(auth.uid()));

CREATE POLICY "Los proveedores pueden ver comprobantes de sus pagos"
ON public.payment_proofs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM pagos
    WHERE pagos.id = payment_proofs.pago_id 
    AND pagos.supplier_id = auth.uid()
  )
);
```

### 1.2 Columnas adicionales en tabla pagos

```sql
-- Agregar columnas para seguimiento de pagos parciales
ALTER TABLE public.pagos 
ADD COLUMN IF NOT EXISTS original_amount NUMERIC,
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- Actualizar registros existentes
UPDATE public.pagos 
SET original_amount = amount, paid_amount = 0 
WHERE original_amount IS NULL;
```

### 1.3 Columna impuestos_detalle en invoices

```sql
-- Agregar columna para almacenar detalle de impuestos (traslados y retenciones)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS impuestos_detalle JSONB DEFAULT '{}'::jsonb;

-- Estructura esperada del JSONB:
-- {
--   "traslados": [
--     {"impuesto": "002", "tipo_factor": "Tasa", "tasa_o_cuota": "0.160000", "base": 1000, "importe": 160}
--   ],
--   "retenciones": [
--     {"impuesto": "001", "importe": 100},
--     {"impuesto": "002", "importe": 50}
--   ]
-- }
```

### 1.4 Campos adicionales en tabla profiles (Registro de Proveedores)

```sql
-- Agregar enums para tipo de persona y tipo de venta
CREATE TYPE public.tipo_persona AS ENUM ('fisica', 'moral');
CREATE TYPE public.tipo_venta AS ENUM ('medicamentos', 'otros');

-- Agregar columnas a profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS tipo_persona public.tipo_persona,
ADD COLUMN IF NOT EXISTS tipo_venta public.tipo_venta;

-- NOTA: tipo_persona se determina automáticamente por la longitud del RFC:
-- - 12 caracteres = Persona Moral
-- - 13 caracteres = Persona Física
-- 
-- tipo_venta determina qué documentos se requieren del proveedor:
-- - 'medicamentos' = requiere aviso de funcionamiento + documentos estándar
-- - 'otros' = solo documentos estándar (INE, constancia fiscal, etc.)
```

---

## 2. REGISTRO DE PROVEEDORES - AUTHFORM

### Archivo: `src/components/auth/AuthForm.tsx`

Este componente maneja el inicio de sesión y registro de proveedores con validación de RFC y selección de tipo de venta.

```typescript
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// Schema de validación para login
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "El email es requerido")
    .email("Email inválido")
    .max(255, "Email demasiado largo")
    .toLowerCase(),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "Contraseña demasiado larga"),
});

// Schema de validación para registro con validación de RFC
const signupSchema = loginSchema.extend({
  full_name: z
    .string()
    .trim()
    .min(1, "El nombre completo es requerido")
    .max(100, "Nombre demasiado largo"),
  company_name: z
    .string()
    .trim()
    .min(1, "El nombre de empresa es requerido")
    .max(100, "Nombre de empresa demasiado largo"),
  rfc: z
    .string()
    .trim()
    .min(12, "El RFC debe tener 12 caracteres (Persona Moral) o 13 caracteres (Persona Física)")
    .max(13, "El RFC no puede tener más de 13 caracteres")
    .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "Formato de RFC inválido"),
  phone: z
    .string()
    .trim()
    .max(20, "Teléfono demasiado largo")
    .optional(),
  tipo_venta: z.enum(["medicamentos", "otros"], {
    required_error: "Selecciona el tipo de venta",
  }),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

export const AuthForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const navigate = useNavigate();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      full_name: "",
      company_name: "",
      rfc: "",
      phone: "",
      tipo_venta: undefined,
    },
  });

  // Detectar tipo de persona según longitud del RFC
  const rfcValue = signupForm.watch("rfc");
  const tipoPersona = rfcValue?.length === 13 ? "fisica" : rfcValue?.length === 12 ? "moral" : null;

  // Resetear formularios cuando cambie entre login y registro
  useEffect(() => {
    if (isSignUp) {
      loginForm.reset();
    } else {
      signupForm.reset();
    }
  }, [isSignUp, loginForm, signupForm]);

  const handleLogin = async (data: LoginFormValues) => {
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes("Invalid") || error.message.includes("incorrect")) {
          throw new Error("Credenciales inválidas");
        }
        throw error;
      }
      
      toast.success("Sesión iniciada correctamente");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Error al iniciar sesión");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (data: SignupFormValues) => {
    setIsLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/`;
      
      // Crear usuario con Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: data.full_name,
          }
        }
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          throw new Error("Este email ya está registrado");
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Error al crear la cuenta");
      }

      // Determinar tipo de persona por longitud del RFC
      const tipoPersonaValue = data.rfc.length === 13 ? 'fisica' : 'moral';

      // Actualizar perfil con tipo_persona y tipo_venta
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: authData.user.id,
          email: data.email,
          full_name: data.full_name,
          company_name: data.company_name,
          rfc: data.rfc,
          phone: data.phone || null,
          tipo_persona: tipoPersonaValue,
          tipo_venta: data.tipo_venta,
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        throw new Error("Error al actualizar el perfil");
      }

      toast.success("Cuenta creada correctamente. Puedes iniciar sesión.");
      setIsSignUp(false);
      loginForm.reset();
    } catch (error: any) {
      toast.error(error.message || "Error al crear la cuenta");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          {/* Logo de tu empresa aquí */}
          <CardTitle className="text-2xl font-bold">
            {isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
          </CardTitle>
          <CardDescription>
            {isSignUp 
              ? "Regístrate como proveedor en el sistema" 
              : "Ingresa tus credenciales para acceder al sistema"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isSignUp ? (
            <Form {...loginForm} key="login-form">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo Electrónico</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="tu@email.com"
                          autoComplete="email"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••••"
                          autoComplete="current-password"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Iniciar Sesión
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  ¿No tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(true)}
                    className="text-primary hover:underline font-medium"
                    disabled={isLoading}
                  >
                    Regístrate aquí
                  </button>
                </div>
              </form>
            </Form>
          ) : (
            <Form {...signupForm} key="signup-form">
              <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                <FormField
                  control={signupForm.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo *</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="JUAN PÉREZ"
                          disabled={isLoading}
                          required
                          {...field}
                          style={{ textTransform: 'uppercase' }}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo Electrónico *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="tu@email.com"
                          disabled={isLoading}
                          required
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••••"
                          autoComplete="new-password"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de Empresa *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="MI EMPRESA S.A."
                          disabled={isLoading}
                          required
                          style={{ textTransform: 'uppercase' }}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* CAMPO RFC CON DETECCIÓN AUTOMÁTICA DE TIPO DE PERSONA */}
                <FormField
                  control={signupForm.control}
                  name="rfc"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>RFC *</FormLabel>
                        {tipoPersona && (
                          <Badge variant={tipoPersona === "fisica" ? "secondary" : "default"}>
                            {tipoPersona === "fisica" ? "Persona Física (13 caracteres)" : "Persona Moral (12 caracteres)"}
                          </Badge>
                        )}
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="XAXX010101000"
                          disabled={isLoading}
                          required
                          maxLength={13}
                          style={{ textTransform: 'uppercase' }}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormDescription>
                        {!tipoPersona && "Ingresa tu RFC para detectar si eres Persona Física o Moral"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* CAMPO TIPO DE VENTA - NUEVO */}
                <FormField
                  control={signupForm.control}
                  name="tipo_venta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Venta *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona el tipo de venta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="medicamentos">Venta de Medicamentos</SelectItem>
                          <SelectItem value="otros">Venta de otros productos o servicios</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Esto determina los documentos que deberás subir
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          placeholder="5512345678"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Cuenta
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className="text-primary hover:underline font-medium"
                    disabled={isLoading}
                  >
                    Inicia sesión aquí
                  </button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
```

### Puntos Clave del Registro de Proveedores:

1. **Validación de RFC con Regex**: 
   - Acepta 12 caracteres (Persona Moral) o 13 caracteres (Persona Física)
   - Formato: `^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$`

2. **Detección automática de tipo de persona**:
   - Se muestra un Badge visual indicando "Persona Física" o "Persona Moral"
   - Se guarda automáticamente en `profiles.tipo_persona`

3. **Selector de tipo de venta**:
   - "Medicamentos" → requiere documentos adicionales (aviso de funcionamiento)
   - "Otros" → solo documentos estándar

4. **Conversión a mayúsculas**: Nombre, empresa y RFC se convierten automáticamente

---

## 3. LIBRERÍA DE CÁLCULO DE TOTALES

### Archivo: `src/lib/invoiceTotals.ts`

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

---

## 4. EDGE FUNCTION: validate-invoice-xml

### Archivo: `supabase/functions/validate-invoice-xml/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== INICIO validate-invoice-xml ===');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'El cuerpo de la solicitud no es JSON válido'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { xmlPath } = body;
    if (!xmlPath) {
      throw new Error('xmlPath es requerido');
    }

    // Crear cliente de Supabase con service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Descargar el archivo XML desde el storage
    const { data: xmlData, error: downloadError } = await supabase.storage
      .from('invoices')
      .download(xmlPath);

    if (downloadError) {
      throw new Error('Error al descargar el archivo XML del storage');
    }

    const xmlText = await xmlData.text();

    // Extraer información del comprobante usando regex
    const formaPagoMatch = xmlText.match(/FormaPago="([^"]+)"/);
    const metodoPagoMatch = xmlText.match(/MetodoPago="([^"]+)"/);
    const folioMatch = xmlText.match(/Folio="([^"]+)"/);
    const serieMatch = xmlText.match(/Serie="([^"]+)"/);
    const tipoComprobanteMatch = xmlText.match(/TipoDeComprobante="([^"]+)"/);

    // Extraer Total
    let totalMatch = xmlText.match(/cfdi:Comprobante[^>]*Total="([0-9.]+)"/);
    if (!totalMatch) {
      totalMatch = xmlText.match(/\bTotal="([0-9.]+)"/);
    }
    
    // Extraer SubTotal
    let subtotalMatch = xmlText.match(/cfdi:Comprobante[^>]*SubTotal="([0-9.]+)"/);
    if (!subtotalMatch) {
      subtotalMatch = xmlText.match(/\bSubTotal="([0-9.]+)"/);
    }
    
    const descuentoMatch = xmlText.match(/Descuento="([0-9.]+)"/);
    const fechaMatch = xmlText.match(/Fecha="([^"]+)"/);
    const lugarExpedicionMatch = xmlText.match(/LugarExpedicion="([^"]+)"/);
    const uuidMatch = xmlText.match(/UUID="([^"]+)"/);
    
    // Emisor
    const emisorNombreMatch = xmlText.match(/cfdi:Emisor[^>]*Nombre="([^"]+)"/);
    const emisorRfcMatch = xmlText.match(/cfdi:Emisor[^>]*Rfc="([^"]+)"/);
    const emisorRegimenMatch = xmlText.match(/RegimenFiscal="([^"]+)"/);
    
    // Receptor
    const receptorNombreMatch = xmlText.match(/cfdi:Receptor[^>]*Nombre="([^"]+)"/);
    const receptorRfcMatch = xmlText.match(/cfdi:Receptor[^>]*Rfc="([^"]+)"/);
    const receptorUsoCfdiMatch = xmlText.match(/UsoCFDI="([^"]+)"/);

    // VALIDACIÓN: Verificar RFC del receptor
    const receptorRfc = receptorRfcMatch ? receptorRfcMatch[1] : null;
    const RFC_EMPRESA = 'TU_RFC_AQUI'; // ← CAMBIAR POR EL RFC DE TU EMPRESA
    
    if (receptorRfc !== RFC_EMPRESA) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'RFC del receptor inválido',
          mensaje: `El RFC del receptor (${receptorRfc || 'no especificado'}) no corresponde a la empresa.`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extraer impuestos
    const totalImpuestosMatch = xmlText.match(/TotalImpuestosTrasladados="([0-9.]+)"/);
    const totalRetenidosMatch = xmlText.match(/TotalImpuestosRetenidos="([0-9.]+)"/);

    // Extraer detalle de impuestos
    const impuestosDetalle: any = {
      traslados: [],
      retenciones: []
    };

    // Buscar bloque principal de Impuestos
    const impuestosBloqueMatch = xmlText.match(/<cfdi:Impuestos[^>]*TotalImpuesto[^>]*>([\s\S]*?)<\/cfdi:Impuestos>/);
    
    if (impuestosBloqueMatch) {
      const impuestosBloque = impuestosBloqueMatch[0];
      
      // Traslados
      const trasladosBloqueMatch = impuestosBloque.match(/<cfdi:Traslados>([\s\S]*?)<\/cfdi:Traslados>/);
      if (trasladosBloqueMatch) {
        const trasladosBloque = trasladosBloqueMatch[1];
        const trasladosRegex = /<cfdi:Traslado([^>]*)\/>/g;
        let trasladoMatch;
        while ((trasladoMatch = trasladosRegex.exec(trasladosBloque)) !== null) {
          const trasladoText = trasladoMatch[1];
          const impuestoMatch = trasladoText.match(/Impuesto="([^"]+)"/);
          const tipoFactorMatch = trasladoText.match(/TipoFactor="([^"]+)"/);
          const tasaCuotaMatch = trasladoText.match(/Tasa[Oo]Cuota="([0-9.]+)"/);
          const baseMatch = trasladoText.match(/Base="([0-9.]+)"/);
          const importeMatch = trasladoText.match(/Importe="([0-9.]+)"/);

          impuestosDetalle.traslados.push({
            impuesto: impuestoMatch ? impuestoMatch[1] : null,
            tipo_factor: tipoFactorMatch ? tipoFactorMatch[1] : null,
            tasa_o_cuota: tasaCuotaMatch ? tasaCuotaMatch[1] : null,
            base: baseMatch ? parseFloat(baseMatch[1]) : 0,
            importe: importeMatch ? parseFloat(importeMatch[1]) : 0
          });
        }
      }
      
      // Retenciones
      const retencionesBloqueMatch = impuestosBloque.match(/<cfdi:Retenciones>([\s\S]*?)<\/cfdi:Retenciones>/);
      if (retencionesBloqueMatch) {
        const retencionesBloque = retencionesBloqueMatch[1];
        const retencionesRegex = /<cfdi:Retencion([^>]*)\/>/g;
        let retencionMatch;
        while ((retencionMatch = retencionesRegex.exec(retencionesBloque)) !== null) {
          const retencionText = retencionMatch[1];
          const impuestoMatch = retencionText.match(/Impuesto="([^"]+)"/);
          const importeMatch = retencionText.match(/Importe="([0-9.]+)"/);

          impuestosDetalle.retenciones.push({
            impuesto: impuestoMatch ? impuestoMatch[1] : null,
            importe: importeMatch ? parseFloat(importeMatch[1]) : 0
          });
        }
      }
    } else {
      // Fallback: sumar impuestos de conceptos
      const trasladosMap: Record<string, any> = {};
      const retencionesMap: Record<string, any> = {};
      
      const trasladosRegex = /<cfdi:Traslado([^>]*)\/>/g;
      let trasladoMatch;
      while ((trasladoMatch = trasladosRegex.exec(xmlText)) !== null) {
        const trasladoText = trasladoMatch[1];
        const impuestoMatch = trasladoText.match(/Impuesto="([^"]+)"/);
        const tasaCuotaMatch = trasladoText.match(/Tasa[Oo]Cuota="([0-9.]+)"/);
        const importeMatch = trasladoText.match(/Importe="([0-9.]+)"/);
        const baseMatch = trasladoText.match(/Base="([0-9.]+)"/);
        
        const impuesto = impuestoMatch ? impuestoMatch[1] : 'desconocido';
        const tasaOCuota = tasaCuotaMatch ? tasaCuotaMatch[1] : null;
        const key = `${impuesto}-${tasaOCuota || 'sin-tasa'}`;
        
        if (!trasladosMap[key]) {
          trasladosMap[key] = { impuesto, tasa_o_cuota: tasaOCuota, base: 0, importe: 0 };
        }
        
        trasladosMap[key].base += baseMatch ? parseFloat(baseMatch[1]) : 0;
        trasladosMap[key].importe += importeMatch ? parseFloat(importeMatch[1]) : 0;
      }
      
      const retencionesRegex = /<cfdi:Retencion([^>]*)\/>/g;
      let retencionMatch;
      while ((retencionMatch = retencionesRegex.exec(xmlText)) !== null) {
        const retencionText = retencionMatch[1];
        const impuestoMatch = retencionText.match(/Impuesto="([^"]+)"/);
        const importeMatch = retencionText.match(/Importe="([0-9.]+)"/);
        
        const impuesto = impuestoMatch ? impuestoMatch[1] : 'desconocido';
        
        if (!retencionesMap[impuesto]) {
          retencionesMap[impuesto] = { impuesto, importe: 0 };
        }
        
        retencionesMap[impuesto].importe += importeMatch ? parseFloat(importeMatch[1]) : 0;
      }
      
      impuestosDetalle.traslados = Object.values(trasladosMap);
      impuestosDetalle.retenciones = Object.values(retencionesMap);
    }

    // Extraer conceptos
    const conceptosRegex = /<cfdi:Concepto([^>]*)>/g;
    const conceptos = [];
    let conceptoMatch;
    
    while ((conceptoMatch = conceptosRegex.exec(xmlText)) !== null) {
      const conceptoText = conceptoMatch[1];
      const claveProdServMatch = conceptoText.match(/ClaveProdServ="([^"]+)"/);
      const claveUnidadMatch = conceptoText.match(/ClaveUnidad="([^"]+)"/);
      const unidadMatch = conceptoText.match(/Unidad="([^"]+)"/);
      const descripcionMatch = conceptoText.match(/Descripcion="([^"]+)"/);
      const cantidadMatch = conceptoText.match(/Cantidad="([0-9.]+)"/);
      const valorUnitarioMatch = conceptoText.match(/ValorUnitario="([0-9.]+)"/);
      const importeMatch = conceptoText.match(/Importe="([0-9.]+)"/);
      const descuentoConceptoMatch = conceptoText.match(/Descuento="([0-9.]+)"/);

      conceptos.push({
        claveProdServ: claveProdServMatch ? claveProdServMatch[1] : '',
        claveUnidad: claveUnidadMatch ? claveUnidadMatch[1] : '',
        unidad: unidadMatch ? unidadMatch[1] : '',
        descripcion: descripcionMatch ? descripcionMatch[1] : '',
        cantidad: cantidadMatch ? parseFloat(cantidadMatch[1]) : 0,
        valorUnitario: valorUnitarioMatch ? parseFloat(valorUnitarioMatch[1]) : 0,
        importe: importeMatch ? parseFloat(importeMatch[1]) : 0,
        descuento: descuentoConceptoMatch ? parseFloat(descuentoConceptoMatch[1]) : 0
      });
    }

    const formaPago = formaPagoMatch ? formaPagoMatch[1] : null;
    const metodoPago = metodoPagoMatch ? metodoPagoMatch[1] : null;
    const tipoComprobante = tipoComprobanteMatch ? tipoComprobanteMatch[1] : null;
    const folio = folioMatch ? folioMatch[1] : null;
    const serie = serieMatch ? serieMatch[1] : null;
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1]) : null;
    const descuento = descuentoMatch ? parseFloat(descuentoMatch[1]) : 0;
    const totalImpuestos = totalImpuestosMatch ? parseFloat(totalImpuestosMatch[1]) : 0;
    const fecha = fechaMatch ? fechaMatch[1] : null;
    const lugarExpedicion = lugarExpedicionMatch ? lugarExpedicionMatch[1] : null;
    const uuid = uuidMatch ? uuidMatch[1] : null;

    // Construir número de factura
    let invoiceNumber = serie ? `${serie}-${folio}` : folio;
    if (!invoiceNumber && uuid) {
      invoiceNumber = uuid;
    }

    // VALIDACIÓN: Si FormaPago = 99, MetodoPago debe ser PPD
    if (formaPago === '99' && metodoPago !== 'PPD') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validación de factura fallida',
          mensaje: 'Error en el XML: Cuando la Forma de Pago es 99, el Método de Pago debe ser PPD.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requiereComplemento = formaPago === '99' && metodoPago === 'PPD';

    return new Response(
      JSON.stringify({
        success: true,
        tipoComprobante,
        formaPago,
        metodoPago,
        invoiceNumber,
        amount: total,
        subtotal,
        descuento,
        totalImpuestos,
        impuestosDetalle,
        fecha,
        lugarExpedicion,
        uuid,
        emisorNombre: emisorNombreMatch?.[1] || null,
        emisorRfc: emisorRfcMatch?.[1] || null,
        emisorRegimenFiscal: emisorRegimenMatch?.[1] || null,
        receptorNombre: receptorNombreMatch?.[1] || null,
        receptorRfc: receptorRfcMatch?.[1] || null,
        receptorUsoCfdi: receptorUsoCfdiMatch?.[1] || null,
        conceptos,
        requiereComplemento,
        mensaje: requiereComplemento 
          ? 'Esta factura requiere un complemento de pago.'
          : 'Factura válida'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en validate-invoice-xml:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 5. EDGE FUNCTION: extract-payment-proof-info

### Archivo: `supabase/functions/extract-payment-proof-info/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pagoId, filePath, installmentId, expectedAmount } = await req.json();
    console.log('Procesando comprobante de pago:', { pagoId, filePath });

    if (!filePath) {
      throw new Error('filePath es requerido');
    }

    const isInstallmentPayment = !!installmentId;

    // Inicializar Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Descargar la imagen desde Storage
    const { data: imageData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(filePath);
    
    if (downloadError || !imageData) {
      throw new Error(`Error descargando imagen: ${downloadError?.message || 'No data'}`);
    }
    
    const imageBuffer = await imageData.arrayBuffer();
    const base64Image = base64Encode(imageBuffer);
    const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;

    // Obtener URL pública
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(filePath);

    // Llamar a IA para extraer información del comprobante
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiza este comprobante de pago bancario mexicano y extrae:
1. Fecha de pago en formato YYYY-MM-DD
2. Número de cuenta destino
3. Tipo de cuenta (Ahorro, Corriente, CLABE)
4. Monto de la transferencia (buscar en campos Monto, Importe, Total - ignorar montos pequeños como $1)`
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_payment_info',
              description: 'Extrae información del comprobante de pago',
              parameters: {
                type: 'object',
                properties: {
                  fecha_pago: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
                  numero_cuenta: { type: 'string', description: 'Número de cuenta destino' },
                  tipo_cuenta: { type: 'string', description: 'Tipo de cuenta' },
                  monto: { type: 'number', description: 'Monto de la transferencia' }
                },
                required: ['fecha_pago', 'numero_cuenta', 'tipo_cuenta', 'monto']
              }
            }
          }
        ],
        tool_choice: 'required'
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`Error llamando a IA: ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let extractedInfo;
    try {
      const content = toolCall.function.arguments;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      extractedInfo = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      extractedInfo = { fecha_pago: null, numero_cuenta: null, tipo_cuenta: null, monto: null };
    }

    // Sanitizar valores
    const sanitizeValue = (value: any): any => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        if (['null', 'undefined', 'no encontrado', 'n/a', ''].includes(lower)) return null;
      }
      return value;
    };

    const paymentDate = sanitizeValue(extractedInfo.fecha_pago);
    const accountNumber = sanitizeValue(extractedInfo.numero_cuenta);
    const extractedAmount = sanitizeValue(extractedInfo.monto);

    // Si es pago de cuota, procesar diferente
    if (isInstallmentPayment) {
      const installmentUpdate: any = {
        comprobante_url: publicUrl,
        status: 'pagado',
        actual_amount: extractedAmount,
      };
      if (paymentDate) installmentUpdate.payment_date = paymentDate;

      await supabaseAdmin
        .from('payment_installments')
        .update(installmentUpdate)
        .eq('id', installmentId);

      return new Response(
        JSON.stringify({ success: true, fecha_pago: paymentDate, extractedAmount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Obtener información del pago
    const { data: pagoData, error: pagoError } = await supabaseAdmin
      .from('pagos')
      .select('supplier_id, datos_bancarios_id, invoice_id, amount')
      .eq('id', pagoId)
      .single();

    if (pagoError || !pagoData) {
      throw new Error('No se pudo obtener información del pago');
    }

    // Obtener monto de la factura
    const { data: invoiceData } = await supabaseAdmin
      .from('invoices')
      .select('amount')
      .eq('id', pagoData.invoice_id)
      .single();

    const invoiceAmount = invoiceData?.amount || pagoData.amount;

    // Validar datos bancarios (comparar cuenta)
    const { data: datosBancarios } = await supabaseAdmin
      .from('documents')
      .select('nombre_cliente, numero_cuenta, numero_cuenta_clabe')
      .eq('id', pagoData.datos_bancarios_id)
      .eq('document_type', 'datos_bancarios')
      .single();

    let discrepancias = null;
    if (datosBancarios && accountNumber) {
      const soloDigitos = (str: string) => str.replace(/\D/g, '');
      const numeroCuentaRegistrado = datosBancarios.numero_cuenta || '';
      const clabeRegistrada = datosBancarios.numero_cuenta_clabe || '';
      
      const cuentasCoinciden = () => {
        const c1 = soloDigitos(numeroCuentaRegistrado);
        const c2 = soloDigitos(accountNumber);
        const cl1 = soloDigitos(clabeRegistrada);
        
        if (c1 && c2 && c1 === c2) return true;
        if (cl1 && c2 && cl1.includes(c2)) return true;
        if (c1 && c2 && c1.slice(-10) === c2.slice(-10)) return true;
        return false;
      };

      if (!cuentasCoinciden()) {
        discrepancias = {
          detectadas: true,
          detalles: {
            numero_cuenta: {
              registrado: numeroCuentaRegistrado || clabeRegistrada,
              comprobante: accountNumber,
              mensaje: 'El número de cuenta no coincide'
            }
          },
          titular_registrado: datosBancarios.nombre_cliente
        };
      }
    }

    // Obtener comprobantes existentes
    const { data: existingProofs } = await supabaseAdmin
      .from('payment_proofs')
      .select('amount, proof_number')
      .eq('pago_id', pagoId)
      .order('proof_number', { ascending: false });

    const totalPaidBefore = existingProofs?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    const nextProofNumber = (existingProofs?.[0]?.proof_number || 0) + 1;
    const currentPaymentAmount = extractedAmount || 0;
    const totalPaidNow = totalPaidBefore + currentPaymentAmount;
    const remainingAmount = invoiceAmount - totalPaidNow;
    const isFullyPaid = remainingAmount <= 0;

    // Guardar comprobante en payment_proofs
    await supabaseAdmin
      .from('payment_proofs')
      .insert({
        pago_id: pagoId,
        invoice_id: pagoData.invoice_id,
        proof_number: nextProofNumber,
        amount: currentPaymentAmount,
        comprobante_url: publicUrl,
        fecha_pago: paymentDate || null,
      });

    // Actualizar pago
    const pagoUpdateData: any = {
      comprobante_pago_url: publicUrl,
      paid_amount: totalPaidNow,
      status: isFullyPaid ? 'pagado' : 'procesando',
      original_amount: invoiceAmount,
    };
    if (paymentDate) pagoUpdateData.fecha_pago = paymentDate;

    await supabaseAdmin
      .from('pagos')
      .update(pagoUpdateData)
      .eq('id', pagoId);

    // Actualizar factura
    await supabaseAdmin
      .from('invoices')
      .update({ status: isFullyPaid ? 'pagado' : 'procesando' })
      .eq('id', pagoData.invoice_id);

    const paymentHistory = existingProofs?.map(p => ({ number: p.proof_number, amount: p.amount })) || [];
    paymentHistory.push({ number: nextProofNumber, amount: currentPaymentAmount });

    if (isFullyPaid) {
      return new Response(
        JSON.stringify({ 
          success: true,
          isFullyPaid: true,
          invoiceAmount,
          totalPaid: totalPaidNow,
          paymentHistory,
          discrepancias,
          message: `Factura pagada completamente. Total: $${invoiceAmount.toLocaleString('es-MX')}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        isPartialPayment: true,
        invoiceAmount,
        currentPayment: currentPaymentAmount,
        totalPaid: totalPaidNow,
        remainingAmount,
        paymentHistory,
        proofNumber: nextProofNumber,
        discrepancias,
        message: `Pago #${nextProofNumber} registrado. Total pagado: $${totalPaidNow.toLocaleString('es-MX')}. Resta: $${remainingAmount.toLocaleString('es-MX')}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error procesando comprobante:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
```

---

## 6. COMPONENTE: PaymentProofsHistory

### Archivo: `src/components/payments/PaymentProofsHistory.tsx`

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, CheckCircle, Clock, Receipt, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getSignedUrl } from "@/lib/storage";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface PaymentProofsHistoryProps {
  pagoId: string;
  invoiceAmount: number;
  paidAmount?: number;
  status: string;
  defaultOpen?: boolean;
}

interface PaymentProof {
  id: string;
  proof_number: number;
  amount: number;
  comprobante_url: string;
  fecha_pago: string | null;
  created_at: string;
}

export function PaymentProofsHistory({ 
  pagoId, 
  invoiceAmount, 
  paidAmount = 0,
  status,
  defaultOpen = false
}: PaymentProofsHistoryProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [proofToDelete, setProofToDelete] = useState<PaymentProof | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const { data: proofs, isLoading } = useQuery({
    queryKey: ["payment-proofs", pagoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_proofs")
        .select("*")
        .eq("pago_id", pagoId)
        .order("proof_number", { ascending: true });

      if (error) throw error;
      return data as PaymentProof[];
    },
    enabled: !!pagoId,
  });

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

      // Obtener invoice_id desde payment_proofs
      const { data: proofData } = await supabase
        .from("payment_proofs")
        .select("invoice_id")
        .eq("pago_id", pagoId)
        .limit(1)
        .maybeSingle();

      if (proofData?.invoice_id || !proofData) {
        const invoiceStatus = newPaidAmount <= 0 ? "pendiente" : 
                             newPaidAmount >= (currentPago.original_amount || 0) ? "pagado" : "procesando";
        
        await supabase
          .from("invoices")
          .update({ status: invoiceStatus })
          .eq("id", proofData?.invoice_id);
      }

      return { newPaidAmount };
    },
    onSuccess: () => {
      toast.success("Comprobante eliminado correctamente");
      queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDeleteDialogOpen(false);
      setProofToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el comprobante");
    },
  });

  const remainingAmount = invoiceAmount - paidAmount;
  const isFullyPaid = remainingAmount <= 0 || status === 'pagado';

  const handleViewProof = async (url: string) => {
    setLoadingImage(true);
    setDialogOpen(true);
    try {
      const urlPath = new URL(url).pathname;
      const filePath = urlPath.split('/').slice(-3).join('/');
      const signedUrl = await getSignedUrl('documents', filePath, 3600);
      setSelectedProofUrl(signedUrl);
    } catch (error) {
      console.error('Error loading signed URL:', error);
    } finally {
      setLoadingImage(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, proof: PaymentProof) => {
    e.stopPropagation();
    setProofToDelete(proof);
    setDeleteDialogOpen(true);
  };

  if (isLoading || !proofs || proofs.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between p-2 h-auto">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="text-sm font-medium">
              Historial de pagos ({proofs.length})
            </span>
            {isFullyPaid ? (
              <Badge variant="default" className="bg-green-600 ml-2">
                <CheckCircle className="h-3 w-3 mr-1" />
                Pagado
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 ml-2">
                <Clock className="h-3 w-3 mr-1" />
                Resta: ${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </Badge>
            )}
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-2 space-y-2">
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm font-medium border-b pb-2">
            <span>Total factura:</span>
            <span>${invoiceAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
          
          {proofs.map((proof) => (
            <div 
              key={proof.id} 
              className="flex justify-between items-center text-sm py-1 hover:bg-muted/80 px-2 rounded cursor-pointer group"
              onClick={() => handleViewProof(proof.comprobante_url)}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Pago #{proof.proof_number}
                </Badge>
                {proof.fecha_pago && (
                  <span className="text-muted-foreground text-xs">
                    {new Date(proof.fecha_pago).toLocaleDateString('es-MX')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-green-600">
                  -${Number(proof.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDeleteClick(e, proof)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          
          <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
            <span>Total pagado:</span>
            <span className="text-green-600">
              ${paidAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>
          
          {!isFullyPaid && (
            <div className="flex justify-between text-sm font-bold text-orange-600">
              <span>Pendiente:</span>
              <span>${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprobante de Pago</DialogTitle>
          </DialogHeader>
          {loadingImage ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : selectedProofUrl ? (
            <img src={selectedProofUrl} alt="Comprobante de pago" className="w-full rounded-lg border" />
          ) : (
            <p className="text-center text-muted-foreground p-4">No se pudo cargar la imagen</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar comprobante de pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el comprobante de pago #{proofToDelete?.proof_number} por{" "}
              <span className="font-semibold">
                ${Number(proofToDelete?.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>.
              <br /><br />
              El monto pagado de la factura se actualizará automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => proofToDelete && deleteMutation.mutate(proofToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Eliminando...</>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
```

---

## 7. COMPONENTE: InvoicePaymentProofUpload

### Archivo: `src/components/invoices/InvoicePaymentProofUpload.tsx`

```tsx
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileCheck, Plus, CheckCircle2, Eye, Receipt } from "lucide-react";
import { convertPDFToImages } from "@/lib/pdfToImages";
import { useAuth } from "@/hooks/useAuth";
import { getSignedUrl } from "@/lib/storage";
import { calculateInvoiceTotal } from "@/lib/invoiceTotals";

interface InvoicePaymentProofUploadProps {
  invoiceId: string;
  supplierId: string;
  hasProof: boolean;
  proofUrl?: string | null;
  invoiceAmount?: number;
  paidAmount?: number;
}

export function InvoicePaymentProofUpload({ 
  invoiceId, 
  supplierId, 
  hasProof, 
  proofUrl,
  invoiceAmount = 0,
  paidAmount = 0
}: InvoicePaymentProofUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const isFullyPaid = paidAmount >= invoiceAmount && invoiceAmount > 0;
  const remainingAmount = Math.max(0, invoiceAmount - paidAmount);

  // Fetch payment info
  const { data: paymentInfo } = useQuery({
    queryKey: ["payment-info", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select("id, paid_amount, amount, status")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch payment proofs
  const { data: paymentProofs, isLoading: proofsLoading } = useQuery({
    queryKey: ["payment-proofs-invoice", invoiceId],
    queryFn: async () => {
      if (!paymentInfo?.id) return [];
      const { data, error } = await supabase
        .from("payment_proofs")
        .select("*")
        .eq("pago_id", paymentInfo.id)
        .order("proof_number", { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!paymentInfo?.id
  });

  const handleViewProof = async (url: string) => {
    setLoadingImage(true);
    try {
      const urlPath = new URL(url).pathname;
      const filePath = urlPath.split('/').slice(-3).join('/');
      const signedUrl = await getSignedUrl('documents', filePath, 3600);
      setSelectedProofUrl(signedUrl);
    } catch (error) {
      toast.error('Error al cargar la imagen');
    } finally {
      setLoadingImage(false);
    }
  };

  const effectivePaidAmount = paymentInfo?.paid_amount ?? paidAmount;
  const effectiveIsFullyPaid = effectivePaidAmount >= invoiceAmount && invoiceAmount > 0;
  const effectiveRemainingAmount = Math.max(0, invoiceAmount - effectivePaidAmount);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      let { data: pagoData, error: pagoError } = await supabase
        .from("pagos")
        .select("id")
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      if (!pagoData) {
        // Crear pago si no existe
        const { data: bankDocsData, error: bankDocsError } = await supabase
          .from("documents")
          .select("id, nombre_banco")
          .eq("supplier_id", supplierId)
          .eq("document_type", "datos_bancarios")
          .eq("status", "aprobado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bankDocsError) throw bankDocsError;
        if (!bankDocsData) throw new Error("No se encontraron datos bancarios aprobados");

        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoices")
          .select("amount, subtotal, descuento, total_impuestos, impuestos_detalle")
          .eq("id", invoiceId)
          .single();

        if (invoiceError) throw invoiceError;

        const computedInvoiceTotal = invoiceAmount > 0 ? invoiceAmount : calculateInvoiceTotal(invoiceData);

        const { data: newPago, error: createPagoError } = await supabase
          .from("pagos")
          .insert({
            supplier_id: supplierId,
            datos_bancarios_id: bankDocsData.id,
            invoice_id: invoiceId,
            amount: computedInvoiceTotal,
            original_amount: computedInvoiceTotal,
            status: "pendiente",
            nombre_banco: bankDocsData.nombre_banco,
          })
          .select("id")
          .single();

        if (createPagoError) throw createPagoError;
        pagoData = newPago;
      }

      // Convertir PDF si es necesario
      let imageFile: File;
      if (file.type === 'application/pdf') {
        const result = await convertPDFToImages(file);
        if (result.images.length === 0) throw new Error('No se pudo convertir el PDF');
        imageFile = new File([result.images[0]], 'comprobante.png', { type: 'image/png' });
      } else {
        imageFile = file;
      }

      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${supplierId}/comprobantes/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data, error: functionError } = await supabase.functions.invoke(
        'extract-payment-proof-info',
        { body: { pagoId: pagoData.id, filePath: fileName } }
      );

      if (functionError) throw functionError;
      return { ...data, pagoId: pagoData.id };
    },
    onSuccess: (data) => {
      if (data?.isFullyPaid) {
        toast.success(data.message, { duration: 8000 });
      } else if (data?.isPartialPayment) {
        toast.warning(data.message, { duration: 10000 });
      } else {
        toast.success("Comprobante procesado correctamente");
      }
      
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      queryClient.invalidateQueries({ queryKey: ["payment-info"] });
      setFile(null);
      setOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al subir el comprobante");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Solo se permiten archivos JPG, PNG o PDF');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = () => {
    if (!file) {
      toast.error("Por favor selecciona un archivo");
      return;
    }
    uploadMutation.mutate(file);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const getButtonVariant = () => {
    if (!isAdmin) return "outline";
    if (effectiveIsFullyPaid) return "outline";
    if (hasProof) return "secondary";
    return "default";
  };

  const getButtonIcon = () => {
    if (!isAdmin) return <Eye className="h-3.5 w-3.5 text-green-600" />;
    if (effectiveIsFullyPaid) return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    if (hasProof) return <Plus className="h-3.5 w-3.5" />;
    return <FileCheck className="h-3.5 w-3.5" />;
  };

  const getTooltipText = () => {
    if (!isAdmin) return "Ver comprobantes de pago";
    if (effectiveIsFullyPaid) return "Factura pagada completamente";
    if (hasProof) return "Agregar otro comprobante de pago";
    return "Subir comprobante de pago";
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => { setOpen(newOpen); if (!newOpen) setFile(null); }}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant={getButtonVariant()} size="icon" className="h-8 w-8">
                {getButtonIcon()}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent><p>{getTooltipText()}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {!isAdmin ? "Comprobantes de Pago" : (effectiveIsFullyPaid ? "Factura Pagada" : hasProof ? "Agregar Comprobante" : "Subir Comprobante")}
          </DialogTitle>
        </DialogHeader>

        {/* Resumen de pagos */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Total de factura:</span>
            <span className="font-medium">{formatCurrency(invoiceAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Total pagado:</span>
            <span className="font-medium text-green-600">{formatCurrency(effectivePaidAmount)}</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="font-medium">Pendiente:</span>
            <span className={`font-bold ${effectiveIsFullyPaid ? 'text-green-600' : 'text-orange-600'}`}>
              {effectiveIsFullyPaid ? "Pagado" : formatCurrency(effectiveRemainingAmount)}
            </span>
          </div>
        </div>

        {/* Vista para proveedores */}
        {!isAdmin ? (
          <div className="space-y-4">
            {proofsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : paymentProofs && paymentProofs.length > 0 ? (
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
                      {proof.fecha_pago && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(proof.fecha_pago).toLocaleDateString('es-MX')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600">{formatCurrency(Number(proof.amount))}</span>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
                
                {selectedProofUrl && (
                  <div className="mt-4 border rounded-lg overflow-hidden">
                    {loadingImage ? (
                      <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : (
                      <img src={selectedProofUrl} alt="Comprobante" className="w-full rounded-lg" />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Receipt className="h-12 w-12 mb-4 opacity-50" />
                <p>Aún no hay comprobantes registrados</p>
              </div>
            )}
          </div>
        ) : effectiveIsFullyPaid ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <p className="text-lg font-semibold text-green-600">¡Factura completamente pagada!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="proof-file">Archivo (JPG, PNG o PDF)</Label>
              <Input id="proof-file" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileChange} className="mt-2" />
              {file && <p className="text-sm text-muted-foreground mt-1">Archivo: {file.name}</p>}
            </div>
            
            <Button onClick={handleUpload} disabled={!file || uploadMutation.isPending} className="w-full">
              {uploadMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando...</>
              ) : (
                hasProof ? "Agregar Comprobante" : "Subir y Procesar"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## 8. PÁGINA: Payments.tsx (Fragmentos clave)

### Query para obtener pagos con comprobantes

```typescript
const { data: pagos, isLoading } = useQuery({
  queryKey: ["pagos-con-comprobantes", user?.id, isAdmin],
  queryFn: async () => {
    let query = supabase
      .from("pagos")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!isAdmin && user?.id) {
      query = query.eq("supplier_id", user.id);
    }

    const { data: pagosData, error: pagosErr } = await query;
    if (pagosErr) throw pagosErr;
    if (!pagosData) return [];

    const allPaymentRows: any[] = [];

    for (const pago of pagosData) {
      // Obtener profile, bank data, invoice...
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, company_name, rfc")
        .eq("id", pago.supplier_id)
        .single();

      const { data: invoice } = await supabase
        .from("invoices")
        .select("invoice_number, amount, fecha_emision, status")
        .eq("id", pago.invoice_id)
        .single();

      // Obtener payment_proofs
      const { data: paymentProofs } = await supabase
        .from("payment_proofs")
        .select("*")
        .eq("pago_id", pago.id)
        .order("proof_number", { ascending: true });

      const baseData = {
        profiles: profile,
        invoice_amount: invoice?.amount || pago.amount,
        // ... otros datos
      };

      // Si hay comprobantes, crear una fila por cada uno
      if (paymentProofs && paymentProofs.length > 0) {
        for (const proof of paymentProofs) {
          allPaymentRows.push({
            ...baseData,
            id: proof.id,
            amount: proof.amount,
            status: "pagado",
            fecha_pago: proof.fecha_pago,
            proof_number: proof.proof_number,
            is_proof: true,
          });
        }

        // Si hay monto restante, agregar fila de pendiente
        const totalPagado = paymentProofs.reduce((sum, p) => sum + Number(p.amount), 0);
        const restante = (invoice?.amount || pago.amount) - totalPagado;

        if (restante > 0.01) {
          allPaymentRows.push({
            ...baseData,
            id: `${pago.id}-pending`,
            amount: restante,
            status: "pendiente",
            is_pending_remainder: true,
          });
        }
      } else {
        allPaymentRows.push({ ...baseData, ...pago, is_proof: false });
      }
    }

    return allPaymentRows.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },
});
```

---

## 9. DEPENDENCIAS REQUERIDAS

### package.json (dependencias relevantes)

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.75.1",
    "@tanstack/react-query": "^5.83.0",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-tooltip": "^1.2.7",
    "lucide-react": "^0.462.0",
    "sonner": "^1.7.4",
    "date-fns": "^3.6.0",
    "xlsx": "^0.18.5"
  }
}
```

### Función auxiliar: getSignedUrl

```typescript
// src/lib/storage.ts
import { supabase } from "@/integrations/supabase/client";

export async function getSignedUrl(bucket: string, path: string, expiresIn: number = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  
  if (error) throw error;
  return data.signedUrl;
}
```

---

## 📝 NOTAS DE IMPLEMENTACIÓN

1. **Cambiar RFC_EMPRESA** en `validate-invoice-xml` por el RFC real de la empresa receptora
2. **Configurar LOVABLE_API_KEY** como secret en Supabase para la extracción de datos con IA
3. **Storage buckets**: Asegurar que existan `invoices` (privado) y `documents` (privado)
4. **RLS**: Las políticas mostradas asumen funciones `is_admin()`, `has_role()` existentes

---

*Documento generado el 2 de febrero de 2026*
