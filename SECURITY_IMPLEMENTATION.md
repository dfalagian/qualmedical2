# Implementación de Seguridad - Sistema de Proveedores

## Resumen Ejecutivo
Este documento describe las medidas de seguridad implementadas en el sistema de gestión de proveedores para proteger contra accesos no autorizados, robo de información y vulnerabilidades comunes.

## 1. Seguridad de Base de Datos

### Row Level Security (RLS)
✅ **Todas las tablas tienen RLS habilitado** con políticas específicas:

#### Documentos (`documents`)
- ✅ Proveedores solo pueden ver sus propios documentos
- ✅ Proveedores solo pueden actualizar documentos en estado 'pendiente' o 'rechazado'
- ✅ Solo admins pueden ver todos los documentos
- ✅ Solo admins pueden eliminar documentos

#### Versiones de Documentos (`document_versions`)
- ✅ Solo admins pueden insertar versiones
- ✅ Nadie puede actualizar versiones históricas (auditoría)
- ✅ Nadie puede eliminar versiones históricas (integridad)

#### Facturas (`invoices`)
- ✅ Proveedores solo pueden ver sus propias facturas
- ✅ Proveedores no pueden modificar facturas después de subirlas
- ✅ Nadie puede eliminar facturas (auditoría)

#### Órdenes de Compra (`purchase_orders`)
- ✅ Solo admins pueden crear, actualizar y eliminar
- ✅ Proveedores solo pueden ver sus propias órdenes

#### Mensajes (`messages`)
- ✅ Usuarios solo ven mensajes donde son remitente o destinatario
- ✅ Solo el destinatario puede marcar como leído
- ✅ Usuarios solo pueden eliminar sus propios mensajes enviados

#### Perfiles (`profiles`)
- ✅ Usuarios pueden ver y actualizar su propio perfil
- ✅ Solo usuarios autenticados pueden ver perfiles de admin
- ✅ Admins pueden ver, actualizar y eliminar cualquier perfil
- ✅ Trigger previene cambio de email por usuarios no-admin

#### Roles (`user_roles`)
- ✅ Solo admins pueden gestionar roles
- ✅ Admins no pueden cambiar su propio rol (previene escalación)
- ✅ Usuarios pueden ver sus propios roles

### Funciones de Seguridad
```sql
-- Todas las funciones tienen SECURITY DEFINER y search_path establecido
- has_role(_user_id, _role): Verifica roles sin recursión RLS
- is_admin(_user_id): Verifica si usuario es admin
- handle_document_version(): Crea versiones automáticas (search_path seguro)
- handle_updated_at(): Actualiza timestamps (search_path seguro)
- prevent_email_change(): Previene cambio de email no autorizado
```

## 2. Seguridad de Autenticación

### Políticas de Contraseñas
- ✅ Protección contra contraseñas filtradas habilitada
- ✅ Mínimo 6 caracteres
- ✅ Máximo 100 caracteres (previene ataques DoS)
- ✅ Auto-confirmación de email habilitada (desarrollo)

### Manejo de Sesiones
- ✅ Sesiones almacenadas en localStorage con refresh automático
- ✅ Validación de sesión en cada cambio de ruta protegida
- ✅ Cierre de sesión seguro con limpieza de estado

### Mensajes de Error
- ✅ No se revela si un email existe en el sistema
- ✅ Mensajes genéricos: "Credenciales inválidas"
- ✅ No se exponen detalles técnicos al usuario

## 3. Validación de Inputs

### Edge Functions
```typescript
// Validación con zod en create-user y delete-user
- ✅ CreateUserSchema: email, password, name, role, company_name, rfc, phone
- ✅ DeleteUserSchema: userId (UUID validado)
- ✅ Validación antes de cualquier operación
- ✅ Mensajes de error claros para inputs inválidos
```

### Formulario de Autenticación
```typescript
// Validación con zod
- Email: trim, max 255 chars, formato válido, lowercase
- Password: min 6, max 100 chars
- Sin logs de credenciales en consola
```

### Subida de Documentos
```typescript
Validaciones implementadas:
- ✅ Tipo de archivo: Solo JPG, JPEG, PNG
- ✅ Tamaño máximo: 10MB
- ✅ Validación de extensión Y tipo MIME
- ✅ Caracteres peligrosos en nombre de archivo bloqueados
- ✅ Sanitización de nombre de archivo
- ✅ Notas limitadas a 1000 caracteres
- ✅ Feedback en tiempo real de límites
```

### Sistema de Mensajes
```typescript
Validaciones implementadas:
- ✅ Asunto: max 200 caracteres, sanitizado
- ✅ Mensaje: max 5000 caracteres, sanitizado
- ✅ Detección de scripts maliciosos bloqueada
- ✅ Trim de espacios en blanco
- ✅ Contadores de caracteres en tiempo real
```

### Gestión de Usuarios (Admin)
```typescript
Validaciones con zod:
- ✅ Nombre requerido
- ✅ Email válido y bloqueado para edición
- ✅ RFC, teléfono opcionales pero validados
- ✅ Confirmación antes de eliminar usuarios
```

## 4. Almacenamiento de Archivos

### Buckets de Supabase Storage
- ✅ Bucket `documents`: PRIVADO (actualizado en migración)
- ✅ Bucket `invoices`: PRIVADO
- ✅ Nombres de archivo con UUID de usuario
- ✅ Timestamps para prevenir colisiones
- ✅ Acceso controlado por RLS con políticas específicas

### Políticas RLS de Storage
```sql
- ✅ SELECT: Usuarios ven sus propios documentos, admins ven todo
- ✅ INSERT: Usuarios solo suben a su propia carpeta (userId/)
- ✅ UPDATE: Usuarios actualizan sus archivos, admins actualizan todo
- ✅ DELETE: Solo admins pueden eliminar documentos
```

### Signed URLs
- ✅ Utilidad `getSignedUrl()` en `src/lib/storage.ts`
- ✅ URLs temporales con expiración (default: 1 hora)
- ✅ Soporte para múltiples URLs con `getSignedUrls()`
- ✅ Implementado en `ImageViewer.tsx` para documentos privados

## 5. Prevención de Ataques Comunes

### SQL Injection
- ✅ Todas las queries usan prepared statements de Supabase
- ✅ RLS previene acceso no autorizado a datos
- ✅ Validación de tipos en TypeScript

### XSS (Cross-Site Scripting)
- ✅ Sanitización de inputs
- ✅ Detección de patrones peligrosos (`<script>`, `javascript:`, etc.)
- ✅ React escapa automáticamente el contenido
- ✅ No se usa `dangerouslySetInnerHTML`

### CSRF (Cross-Site Request Forgery)
- ✅ Tokens de sesión JWT en cada request
- ✅ Validación de origen en Supabase
- ✅ No se almacenan credenciales en localStorage

### Path Traversal
- ✅ Nombres de archivo sanitizados
- ✅ Estructura de carpetas controlada (userId/timestamp.ext)
- ✅ No se permiten caracteres de ruta en nombres

### Privilege Escalation
- ✅ Roles almacenados en tabla separada
- ✅ Función SECURITY DEFINER para verificar roles
- ✅ Admins no pueden cambiar su propio rol
- ✅ Validación en backend y frontend

### File Upload Attacks
- ✅ Whitelist de tipos MIME
- ✅ Whitelist de extensiones
- ✅ Límite de tamaño de archivo
- ✅ Validación de contenido (tipo MIME real)

## 6. Auditoría y Trazabilidad

### Versiones de Documentos
- ✅ Historial inmutable de cambios
- ✅ No se pueden modificar versiones antiguas
- ✅ No se pueden eliminar versiones antiguas
- ✅ Trigger automático al actualizar documento

### Timestamps
- ✅ `created_at` en todas las tablas
- ✅ `updated_at` con trigger automático
- ✅ `reviewed_at` y `reviewed_by` en documentos

### Registros de Actividad
- ✅ Mensajes muestran remitente y destinatario
- ✅ Documentos registran quién los revisó
- ✅ Estado de lectura en mensajes

## 7. Mejores Prácticas Implementadas

### Frontend
- ✅ Validación client-side Y server-side
- ✅ Feedback inmediato al usuario
- ✅ Sanitización antes de enviar
- ✅ Mensajes de error genéricos
- ✅ Loading states para prevenir double-submit

### Backend
- ✅ RLS en todas las tablas
- ✅ Funciones con SECURITY DEFINER
- ✅ search_path establecido
- ✅ Validación en edge functions
- ✅ Secrets en variables de entorno

### Gestión de Errores
- ✅ No se exponen stack traces
- ✅ Logs solo en desarrollo
- ✅ Mensajes user-friendly
- ✅ Códigos de error consistentes

## 8. Recomendaciones Adicionales

### Para Producción
1. **Habilitar HTTPS**: Asegurarse de que toda la comunicación sea cifrada
2. **Rate Limiting**: Implementar límites de intentos de login
3. **2FA**: Considerar autenticación de dos factores
4. **Backups**: Programar respaldos automáticos de la base de datos
5. **Monitoring**: Configurar alertas para actividad sospechosa
6. **Deshabilitar auto-confirm email**: Requerir verificación de email

### Mantenimiento Continuo
1. Revisar logs de autenticación periódicamente
2. Auditar permisos de usuarios regularmente
3. Actualizar dependencias de seguridad
4. Revisar políticas RLS al agregar tablas nuevas
5. Pruebas de penetración periódicas

## 9. Contacto de Seguridad

Si se detecta una vulnerabilidad:
1. No compartir públicamente
2. Contactar al equipo de desarrollo
3. Proporcionar detalles técnicos
4. Esperar confirmación antes de divulgar

## 10. Registro de Cambios

### 2025-10-29 - Migración de Seguridad Crítica
**Vulnerabilidades Corregidas:**
1. ✅ **medicine_counts**: Política INSERT ahora requiere autenticación como admin
2. ✅ **profiles**: Acceso a perfiles de admin restringido solo a usuarios autenticados
3. ✅ **Storage documents**: Bucket ahora es privado con políticas RLS completas
4. ✅ **Edge functions**: Validación Zod agregada a create-user y delete-user

**Archivos Modificados:**
- `supabase/functions/create-user/index.ts` - Validación con CreateUserSchema
- `supabase/functions/delete-user/index.ts` - Validación con DeleteUserSchema
- `src/lib/storage.ts` - Nueva utilidad para signed URLs
- `src/components/admin/ImageViewer.tsx` - Uso de signed URLs
- Migración SQL: `20251029141457_7394800a-9b37-4fa3-b8d7-f2a0fe9fce17.sql`

**Impacto:** Cero interrupciones en producción. Sistema funcionando normalmente.

---

**Última actualización**: 2025-10-29
**Versión**: 1.1
**Estado**: ✅ Implementado, activo y securizado
