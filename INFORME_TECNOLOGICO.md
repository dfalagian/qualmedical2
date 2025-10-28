# Informe Tecnológico - Sistema de Gestión de Proveedores QualMedical

## Resumen Ejecutivo
Sistema integral para la gestión y control de proveedores de QualMedical Farma, con autenticación, gestión de documentos, facturas, órdenes de compra y validación de documentos mediante IA.

---

## Stack Tecnológico Principal

### Frontend

#### Framework y Herramientas Core
- **React 18.3.1** - Librería principal para construcción de interfaces
- **TypeScript** - Superset de JavaScript con tipado estático
- **Vite** - Build tool y dev server de alta velocidad
- **React Router DOM 6.30.1** - Enrutamiento y navegación

#### Estilización y Componentes UI
- **Tailwind CSS** - Framework de utilidades CSS
- **shadcn/ui** - Sistema de componentes reutilizables
- **Radix UI** - Primitivos de UI accesibles sin estilos:
  - Accordion, Alert Dialog, Avatar, Calendar
  - Checkbox, Dialog, Dropdown Menu, Popover
  - Select, Tabs, Tooltip, y más (20+ componentes)
- **class-variance-authority 0.7.1** - Gestión de variantes de componentes
- **tailwind-merge 2.6.0** - Merge inteligente de clases Tailwind
- **tailwindcss-animate 1.0.7** - Animaciones con Tailwind
- **lucide-react 0.462.0** - Iconos (462 iconos disponibles)
- **next-themes 0.3.0** - Soporte para temas claros/oscuros

#### Gestión de Estado y Datos
- **@tanstack/react-query 5.83.0** - Data fetching, caching y sincronización
- **@supabase/supabase-js 2.75.1** - Cliente de Supabase para backend

#### Formularios y Validación
- **React Hook Form 7.61.1** - Gestión de formularios performante
- **@hookform/resolvers 3.10.0** - Integración con validadores
- **Zod 3.25.76** - Validación de esquemas TypeScript-first

#### Visualización de Datos
- **Recharts 2.15.4** - Librería de gráficos basada en componentes React
- **date-fns 3.6.0** - Utilidades modernas para manejo de fechas
- **react-day-picker 8.10.1** - Selector de fechas

#### Procesamiento de Archivos
- **pdfjs-dist 5.4.296** - Renderizado y procesamiento de PDFs

#### UI Avanzada
- **cmdk 1.1.1** - Command menu (búsqueda de comandos)
- **embla-carousel-react 8.6.0** - Carrusel de imágenes
- **sonner 1.7.4** - Notificaciones toast elegantes
- **vaul 0.9.9** - Drawer component para móvil
- **input-otp 1.4.2** - Input para códigos OTP
- **react-resizable-panels 2.1.9** - Paneles redimensionables

---

## Backend (Lovable Cloud - Supabase)

### Base de Datos
- **PostgreSQL** - Base de datos relacional

#### Tablas Principales
1. **profiles** - Perfiles de usuarios
2. **user_roles** - Roles de usuarios (admin/proveedor)
3. **documents** - Documentos de proveedores (INE, RFC, etc.)
4. **document_versions** - Historial de versiones de documentos
5. **invoices** - Facturas
6. **invoice_items** - Items de facturas
7. **purchase_orders** - Órdenes de compra
8. **messages** - Mensajería interna
9. **medicine_counts** - Conteo de medicamentos

#### Seguridad
- **Row Level Security (RLS)** - Políticas de acceso a nivel de fila
- **JWT Authentication** - Autenticación mediante tokens
- Funciones de base de datos:
  - `is_admin()` - Verificación de rol admin
  - `has_role()` - Verificación de roles
  - `prevent_email_change()` - Prevención de cambios no autorizados
  - `handle_document_version()` - Versionado automático
  - `handle_new_user()` - Creación de perfil automático

### Almacenamiento
- **Supabase Storage** - Almacenamiento de archivos
  - Bucket `documents` (público) - Documentos generales
  - Bucket `invoices` (privado) - Facturas XML/PDF

### Funciones Serverless (Edge Functions)

1. **extract-document-info**
   - Extracción de información de documentos mediante IA
   - Procesamiento de INE, RFC, Constancias Fiscales
   - Validación automática

2. **count-medicine-boxes**
   - Conteo de cajas de medicamentos en imágenes
   - Análisis mediante IA

3. **validate-invoice-xml**
   - Validación de facturas XML (CFDI)
   - Extracción de datos fiscales
   - Validación de términos de pago

4. **create-user**
   - Creación de usuarios (solo admins)

5. **delete-user**
   - Eliminación de usuarios (solo admins)

### Autenticación
- Email/contraseña
- Auto-confirmación de email habilitada
- JWT tokens con refresh automático
- Persistencia de sesión en localStorage

---

## Herramientas de Desarrollo

### Linting y Calidad de Código
- **ESLint** - Linter de código JavaScript/TypeScript
- Configuración TypeScript estricta

### Build y Deploy
- **Vite** - Build optimizado para producción
- Code splitting automático
- Minificación y ofuscación
- Optimización de assets

---

## APIs y Servicios Externos

### IA y Procesamiento
- **Lovable AI** - Integración de IA sin necesidad de API keys
- Modelos soportados:
  - Google Gemini 2.5 Pro/Flash/Flash-Lite
  - OpenAI GPT-5/GPT-5-mini/GPT-5-nano

### Procesamiento de Documentos
- PDF.js para renderizado de PDFs
- Extracción de información mediante IA
- OCR para imágenes de documentos

---

## Arquitectura y Patrones

### Patrones de Diseño
- **Component-based architecture** - Componentes reutilizables
- **Custom Hooks** - Lógica reutilizable (useAuth, usePDFUpload, etc.)
- **Server State Management** - React Query para datos del servidor
- **Form State Management** - React Hook Form
- **Type Safety** - TypeScript en todo el proyecto

### Seguridad
- Row Level Security (RLS) en todas las tablas
- Validación de entrada con Zod
- Autenticación JWT
- Sanitización de datos
- CORS configurado
- Headers de seguridad

### Estructura de Carpetas
```
src/
├── components/        # Componentes reutilizables
│   ├── ui/           # Componentes de UI (shadcn)
│   ├── admin/        # Componentes específicos de admin
│   ├── auth/         # Componentes de autenticación
│   ├── dashboard/    # Componentes de dashboard
│   └── invoices/     # Componentes de facturas
├── hooks/            # Custom React hooks
├── integrations/     # Integraciones externas (Supabase)
├── lib/              # Utilidades y helpers
├── pages/            # Páginas/rutas de la aplicación
└── assets/           # Assets estáticos

supabase/
├── functions/        # Edge Functions
└── migrations/       # Migraciones de base de datos (auto-generado)
```

---

## Configuración del Proyecto

### Variables de Entorno
- `VITE_SUPABASE_URL` - URL del proyecto Supabase
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Key pública de Supabase
- `VITE_SUPABASE_PROJECT_ID` - ID del proyecto

### Scripts Disponibles
- `npm run dev` - Servidor de desarrollo
- `npm run build` - Build de producción
- `npm run preview` - Preview del build
- `npm run lint` - Linting de código

---

## Características Principales del Sistema

### Para Proveedores
- Registro y autenticación segura
- Subida de documentos (INE, RFC, Constancia Fiscal, etc.)
- Gestión de facturas con XML/PDF
- Visualización de órdenes de compra
- Sistema de mensajería con administradores
- Contador de medicamentos con IA

### Para Administradores
- Dashboard completo de gestión
- Validación y aprobación de documentos
- Gestión de proveedores
- Creación de órdenes de compra
- Extracción automática de información con IA
- Cross-validación de datos
- Gestión de usuarios
- Análisis y reportes

---

## Rendimiento y Optimización

- **Code Splitting** - Carga bajo demanda de componentes
- **React Query Caching** - Cache inteligente de datos
- **Lazy Loading** - Carga diferida de imágenes
- **Optimistic Updates** - Actualizaciones optimistas en UI
- **Debouncing** - En búsquedas y filtros
- **Virtual Scrolling** - Para listas largas (si aplica)

---

## Cumplimiento y Estándares

### Accesibilidad
- Componentes Radix UI con accesibilidad integrada
- ARIA labels y roles apropiados
- Navegación por teclado

### SEO
- Meta tags configurables
- Semantic HTML
- Robots.txt configurado

### Seguridad
- HTTPS obligatorio
- RLS en base de datos
- Validación en cliente y servidor
- Sanitización de entradas
- JWT con expiración y refresh

---

## Versiones y Compatibilidad

### Navegadores Soportados
- Chrome/Edge (últimas 2 versiones)
- Firefox (últimas 2 versiones)
- Safari (últimas 2 versiones)

### Requisitos del Sistema
- Node.js 18+
- npm o yarn
- Navegadores modernos con ES6+

---

## Dependencias de Producción (Resumen)

Total de dependencias: **49 packages**

Categorías principales:
- **UI Components**: 23 paquetes Radix UI + shadcn
- **Forms & Validation**: 3 paquetes
- **Data Management**: 2 paquetes
- **Routing**: 1 paquete
- **Charts**: 1 paquete
- **PDF Processing**: 1 paquete
- **Utilities**: 18 paquetes

---

## Mantenimiento y Actualizaciones

### Actualizaciones Automáticas
- Supabase types regenerado automáticamente
- Edge Functions deploy automático
- Client de Supabase auto-configurado

### Gestión Manual
- Dependencias de npm
- Componentes de UI personalizados
- Lógica de negocio

---

## Documentación de Referencia

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Supabase Docs](https://supabase.com/docs)
- [React Query](https://tanstack.com/query/latest)
- [Zod](https://zod.dev)

---

**Fecha del Informe**: 2025-10-28  
**Versión del Sistema**: 1.0  
**Autor**: Sistema QualMedical
