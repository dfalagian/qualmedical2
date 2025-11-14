# GUÍA DE ACTUALIZACIÓN COMPLEMENTARIA
## Mejoras al Sistema Existente de Notificaciones

⚠️ **IMPORTANTE**: Esta guía es para ACTUALIZAR funcionalidades ya existentes, NO para implementar desde cero.

**PREREQUISITOS:**
- Sistema de notificaciones ya implementado
- Edge function `notify-supplier` ya existente
- Hook `useNotifications` ya existente
- Página `Invoices.tsx` con cambios de estado ya implementados

---

## PARTE 1: AGREGAR ESTILOS FALTANTES

### 1.1 Actualizar `src/index.css`

**UBICACIÓN**: Dentro del bloque `@layer base { :root { ... } }`

**BUSCAR** si existen estas variables. **SI NO EXISTEN**, agrégalas junto con los demás colores:

```css
@layer base {
  :root {
    /* ... colores existentes ... */

    /* AGREGAR ESTOS SI NO EXISTEN: */
    --success: 142 71% 45%;
    --success-foreground: 0 0% 100%;

    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 100%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    /* ... resto de colores ... */
  }

  .dark {
    /* ... colores existentes ... */

    /* AGREGAR ESTOS SI NO EXISTEN: */
    --success: 142 71% 55%;
    --success-foreground: 0 0% 100%;

    --warning: 38 92% 60%;
    --warning-foreground: 0 0% 100%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    /* ... resto de colores ... */
  }
}
```

### 1.2 Actualizar `tailwind.config.ts`

**UBICACIÓN**: Dentro del objeto `theme.extend.colors`

**BUSCAR** si existen estos colores. **SI NO EXISTEN**, agrégalos:

```typescript
export default {
  // ... configuración existente ...
  theme: {
    extend: {
      colors: {
        // ... colores existentes como border, input, primary, etc ...

        /* AGREGAR ESTOS SI NO EXISTEN: */
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

        // ... resto de colores ...
      },
    },
  },
  // ... resto de configuración ...
} satisfies Config;
```

**NOTA**: Si estos colores ya existen, NO los modifiques. Solo agrégalos si faltan.

---

## PARTE 2: COMPONENTE DE ESTADO DEL SERVIDOR SMTP

### 2.1 Crear `src/components/dashboard/EmailServerStatus.tsx`

**ACCIÓN**: Crear archivo nuevo

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

## PARTE 3: INTEGRAR COMPONENTE EN DASHBOARD

### 3.1 Modificar `src/pages/Dashboard.tsx`

**PASO A**: Agregar import al inicio del archivo

**UBICACIÓN**: Con los demás imports de componentes

```typescript
import { EmailServerStatus } from "@/components/dashboard/EmailServerStatus";
```

**PASO B**: Agregar componente en el JSX

**UBICACIÓN**: Después del grid de estadísticas y ANTES de la Card de "Actividad Reciente"

**BUSCAR** esta sección en el return:

```typescript
</div>  {/* Cierre del grid de estadísticas */}

<Card className="shadow-md">
  <CardHeader>
    <CardTitle>Actividad Reciente</CardTitle>
```

**AGREGAR** entre estas dos secciones:

```typescript
</div>  {/* Cierre del grid de estadísticas */}

{/* AGREGAR ESTA LÍNEA: */}
{isAdmin && <EmailServerStatus />}

<Card className="shadow-md">
  <CardHeader>
    <CardTitle>Actividad Reciente</CardTitle>
```

---

## ✅ CHECKLIST DE VERIFICACIÓN

### Estilos:
- [ ] Variables `--success`, `--warning`, `--destructive` agregadas en `src/index.css` (tanto en `:root` como en `.dark`)
- [ ] Colores `success`, `warning`, `destructive` agregados en `tailwind.config.ts`

### Componente:
- [ ] Archivo `src/components/dashboard/EmailServerStatus.tsx` creado
- [ ] Todos los imports correctos (Card, Alert, Badge, Button, iconos de lucide-react)
- [ ] Sin errores de TypeScript

### Integración:
- [ ] Import de `EmailServerStatus` agregado en `src/pages/Dashboard.tsx`
- [ ] Componente `{isAdmin && <EmailServerStatus />}` agregado en la posición correcta
- [ ] Componente solo visible para administradores

### Funcionalidad:
- [ ] Botón "Verificar Conexión" funciona
- [ ] Estados visuales (Conectado/Desconectado/Advertencia/Sin verificar) se muestran correctamente
- [ ] Alertas con colores apropiados (verde success, rojo destructive, amarillo warning)
- [ ] Última verificación muestra hora correctamente

---

## 🚨 NOTAS IMPORTANTES

1. **NO toques nada más**: Solo implementa lo que está en esta guía
2. **NO modifiques el edge function**: Ya está funcionando
3. **NO modifiques Invoices.tsx**: Ya tiene las notificaciones implementadas
4. **Solo agrega**: Estilos faltantes + Componente nuevo + Una línea en Dashboard
5. **Colores críticos**: Sin los colores `success`/`warning`/`destructive`, los badges no se verán bien

---

## ¿QUÉ HACE ESTE COMPONENTE?

El componente `EmailServerStatus`:
- Verifica la conexión al servidor SMTP
- Muestra el estado actual del servidor (Conectado/Desconectado/Advertencia)
- Permite al administrador verificar manualmente la conexión
- Muestra mensajes de error detallados si hay problemas
- Lista las variables de entorno requeridas para referencia

**Es una herramienta de diagnóstico** para que el administrador pueda verificar que el sistema de notificaciones por email está funcionando correctamente.
