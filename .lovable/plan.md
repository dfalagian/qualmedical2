

# Plan: Integrar WhatsApp via Twilio

## Resumen

Crear una funcion backend para enviar mensajes de WhatsApp usando la API de Twilio, y conectarla al sistema de notificaciones existente para que los proveedores y clientes reciban confirmaciones por WhatsApp ademas de por email.

## Paso 1 - Configurar credenciales de Twilio

Se necesitan 3 secretos:
- **TWILIO_ACCOUNT_SID** - Tu Account SID de Twilio
- **TWILIO_AUTH_TOKEN** - Tu Auth Token de Twilio  
- **TWILIO_WHATSAPP_FROM** - El numero de WhatsApp de Twilio (formato: `whatsapp:+14155238886`)

Para obtenerlos: Ir a [twilio.com](https://www.twilio.com), crear cuenta, y en la consola obtener Account SID y Auth Token. Para WhatsApp, activar el Sandbox de WhatsApp en Twilio (para pruebas) o solicitar un numero de WhatsApp Business (para produccion).

## Paso 2 - Crear Edge Function `send-whatsapp`

Nueva funcion en `supabase/functions/send-whatsapp/index.ts` que:

1. Recibe `to` (numero de telefono), `message` (texto del mensaje) y opcionalmente `template_type` (tipo de plantilla predefinida)
2. Usa la API REST de Twilio para enviar el mensaje via WhatsApp
3. Formatea el numero destino con prefijo `whatsapp:+52...`
4. Incluye plantillas de mensajes para los eventos principales:
   - Documento aprobado/rechazado
   - Factura validada/rechazada
   - Pago completado
   - Evidencia aprobada/rechazada

## Paso 3 - Agregar campo de telefono al perfil de proveedores

La tabla `profiles` ya tiene un campo `phone`. Se verificara que este disponible y se usara para enviar los mensajes de WhatsApp.

## Paso 4 - Actualizar hook `useNotifications`

Modificar `src/hooks/useNotifications.tsx` para:
- Agregar funcion `notifySupplierWhatsApp` que llama a la nueva edge function
- Opcionalmente enviar notificacion dual (email + WhatsApp) cuando el proveedor tenga telefono registrado

## Paso 5 - Agregar configuracion en `config.toml`

```toml
[functions.send-whatsapp]
verify_jwt = false
```

## Detalles Tecnicos

### API de Twilio (REST, sin SDK)

```text
POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json

Headers:
  Authorization: Basic base64(AccountSid:AuthToken)
  Content-Type: application/x-www-form-urlencoded

Body:
  From=whatsapp:+14155238886
  To=whatsapp:+521234567890
  Body=Tu documento ha sido aprobado
```

### Flujo de la notificacion

```text
Evento del sistema (ej: documento aprobado)
  |
  v
useNotifications.notifySupplier()
  |
  +---> notify-supplier (email) [existente]
  |
  +---> send-whatsapp (WhatsApp) [nuevo]
         |
         v
      Twilio API -> WhatsApp del proveedor
```

### Plantillas de mensajes WhatsApp (texto plano)

Como WhatsApp no soporta HTML, se crearan plantillas en texto plano con emojis para cada tipo de evento, por ejemplo:

- **Documento aprobado**: "QualMedical: Tu documento [tipo] ha sido aprobado. Accede al portal: qualmedical.lovable.app"
- **Factura rechazada**: "QualMedical: Tu factura [numero] fue rechazada. Razon: [motivo]. Revisa el portal."
- **Pago completado**: "QualMedical: Se ha registrado tu pago de $[monto] MXN para la factura [numero]."

## Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `supabase/functions/send-whatsapp/index.ts` | Crear - Edge function para enviar WhatsApp |
| `src/hooks/useNotifications.tsx` | Modificar - Agregar envio dual email+WhatsApp |
| `supabase/config.toml` | Modificar - Registrar nueva funcion |

