# Sistema de Gestión de Proveedores - QualMedical

## Descripción del Proyecto

Sistema integral para la gestión y control de proveedores de QualMedical Farma. Incluye funcionalidades de autenticación, gestión de documentos, facturas, órdenes de compra y validación automática de documentos con IA.

## Tecnologías Utilizadas

Este proyecto está construido con las siguientes tecnologías:

- **React** - Biblioteca de JavaScript para construir interfaces de usuario
- **TypeScript** - Superset tipado de JavaScript
- **Vite** - Herramienta de construcción y desarrollo rápido
- **Tailwind CSS** - Framework de CSS basado en utilidades
- **shadcn/ui** - Componentes de UI reutilizables
- **Supabase** - Backend como servicio (autenticación, base de datos, almacenamiento)
- **React Query (TanStack Query)** - Gestión de estado del servidor
- **React Hook Form** - Gestión de formularios
- **Zod** - Validación de esquemas TypeScript-first

## Características Principales

### Para Proveedores
- Registro y autenticación segura
- Subida de documentos legales y fiscales
- Gestión de facturas
- Mensajería con administradores
- Vista de órdenes de compra asignadas

### Para Administradores
- Dashboard completo de gestión
- Validación y aprobación de documentos
- Gestión de proveedores
- Creación de órdenes de compra
- Extracción automática de información con IA
- Sistema de validación cruzada de documentos

### Seguridad
- Autenticación basada en roles (Admin/Proveedor)
- Row Level Security (RLS) en base de datos
- Validación de entrada en cliente y servidor
- Encriptación de datos sensibles
- Validación automática de documentos con IA

## Instalación y Configuración

### Requisitos Previos
- Node.js (versión 18 o superior)
- npm o yarn
- Cuenta de Supabase configurada

### Instalación

```bash
# Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>

# Navegar al directorio del proyecto
cd <NOMBRE_DEL_PROYECTO>

# Instalar dependencias
npm install

# Iniciar el servidor de desarrollo
npm run dev
```

### Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=tu_clave_publica_de_supabase
VITE_SUPABASE_PROJECT_ID=tu_id_de_proyecto
```

## Estructura del Proyecto

```
src/
├── components/       # Componentes reutilizables
│   ├── auth/        # Componentes de autenticación
│   ├── dashboard/   # Componentes del dashboard
│   └── ui/          # Componentes de UI (shadcn)
├── hooks/           # Custom hooks de React
├── integrations/    # Integraciones externas (Supabase)
├── lib/             # Utilidades y helpers
├── pages/           # Páginas de la aplicación
└── main.tsx         # Punto de entrada de la aplicación

supabase/
├── functions/       # Edge Functions de Supabase
│   ├── create-user/              # Creación de usuarios
│   ├── delete-user/              # Eliminación de usuarios
│   ├── extract-document-info/    # Extracción de info con IA
│   └── count-medicine-boxes/     # Contador de medicamentos
└── migrations/      # Migraciones de base de datos
```

## Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Inicia el servidor de desarrollo

# Construcción
npm run build        # Construye la aplicación para producción

# Vista previa
npm run preview      # Vista previa de la construcción de producción

# Linting
npm run lint         # Ejecuta el linter
```

## Despliegue

### Construcción para Producción

```bash
npm run build
```

Los archivos de producción se generarán en la carpeta `dist/` y estarán:
- Minificados y optimizados
- Sin console.logs ni debuggers
- Con nombres de variables ofuscados
- Sin comentarios en el código
- Sin sourcemaps (código no visible)

### Configuración de Producción

El proyecto incluye optimizaciones automáticas para producción:
- Minificación con Terser
- Eliminación de console.log y debugger
- Ofuscación de código
- Sin sourcemaps en producción
- Optimización de chunks

## Seguridad y Privacidad

Este sistema incluye múltiples capas de seguridad:

1. **Validación de Entrada**: Todos los datos de usuario son validados con Zod
2. **RLS (Row Level Security)**: Políticas estrictas en la base de datos
3. **Autenticación JWT**: Tokens seguros para autenticación
4. **Validación con IA**: Los documentos son validados automáticamente
5. **Headers de Seguridad**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
6. **Código Ofuscado**: El código fuente no es visible en producción

## Soporte y Contacto

Para soporte técnico o consultas, contactar a:
- Email: soporte@qualmedical.com
- Equipo de Desarrollo QualMedical

## Licencia

© 2025 QualMedical Farma. Todos los derechos reservados.

Este software es propiedad de QualMedical Farma y está protegido por leyes de derechos de autor.
