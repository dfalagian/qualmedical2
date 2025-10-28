# PROYECTO COMPLETO - QUALMEDICAL PROVIDER MANAGEMENT SYSTEM

## Fecha de Backup: 2025-10-28

Este documento contiene la documentación completa del código fuente del proyecto QualMedical Provider Management System. Incluye toda la estructura de archivos, código fuente, y configuraciones necesarias para restaurar o entender el proyecto.

---

## 📋 TABLA DE CONTENIDOS

1. [Descripción General](#descripción-general)
2. [Tecnologías Utilizadas](#tecnologías-utilizadas)
3. [Estructura de Directorios](#estructura-de-directorios)
4. [Configuración del Proyecto](#configuración-del-proyecto)
5. [Código Fuente Frontend](#código-fuente-frontend)
6. [Código Fuente Backend](#código-fuente-backend)
7. [Componentes Principales](#componentes-principales)
8. [Hooks Personalizados](#hooks-personalizados)
9. [Páginas de la Aplicación](#páginas-de-la-aplicación)
10. [Edge Functions](#edge-functions)
11. [Utilidades y Librerías](#utilidades-y-librerías)
12. [Instrucciones de Restauración](#instrucciones-de-restauración)

---

## 📖 DESCRIPCIÓN GENERAL

**QualMedical Provider Management System** es un sistema integral para la gestión y control de proveedores de QualMedical Farma. El sistema incluye:

### Características Principales:
- ✅ Autenticación segura con roles (proveedor/administrador)
- 📄 Gestión de documentos con validación por IA
- 🧾 Sistema de facturas con validación XML automática
- 💬 Sistema de mensajería entre proveedores y administradores
- 📦 Gestión de órdenes de compra
- 🔍 Buscador avanzado de documentos de proveedores
- 📊 Contador de medicamentos con IA (visión por computadora)
- 🔐 Seguridad con RLS (Row Level Security)
- 🤖 Extracción automática de datos con IA

---

## 🛠️ TECNOLOGÍAS UTILIZADAS

### Frontend:
- **React 18.3.1** - Librería de interfaz de usuario
- **TypeScript 5.8.3** - Tipado estático
- **Vite 5.4.19** - Build tool y dev server
- **Tailwind CSS 3.4.17** - Framework de CSS
- **shadcn/ui** - Componentes de UI
- **React Router DOM 6.30.1** - Enrutamiento
- **React Query 5.83.0** - Manejo de estado asíncrono
- **React Hook Form 7.61.1** - Manejo de formularios
- **Zod 3.25.76** - Validación de esquemas
- **PDF.js 5.4.296** - Procesamiento de PDFs

### Backend (Supabase/Lovable Cloud):
- **Supabase** - Backend as a Service
- **PostgreSQL** - Base de datos
- **Deno** - Runtime para Edge Functions
- **Lovable AI** - Procesamiento de IA integrado

### Herramientas de Desarrollo:
- **ESLint** - Linter
- **PostCSS** - Procesamiento de CSS
- **Autoprefixer** - Prefijos CSS automáticos

---

## 📁 ESTRUCTURA DE DIRECTORIOS

```
qualmedical-project/
├── public/
│   ├── favicon.png
│   └── robots.txt
├── src/
│   ├── assets/
│   │   └── qualmedical-logo.jpg
│   ├── components/
│   │   ├── admin/
│   │   │   └── ImageViewer.tsx
│   │   ├── auth/
│   │   │   └── AuthForm.tsx
│   │   ├── dashboard/
│   │   │   ├── DashboardHeader.tsx
│   │   │   └── DashboardLayout.tsx
│   │   ├── invoices/
│   │   │   └── InvoiceDetailsDialog.tsx
│   │   └── ui/
│   │       ├── [40+ componentes shadcn]
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   ├── use-toast.ts
│   │   ├── useAuth.tsx
│   │   └── usePDFUpload.tsx
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts
│   │       └── types.ts
│   ├── lib/
│   │   ├── pdfToImages.ts
│   │   └── utils.ts
│   ├── pages/
│   │   ├── Admin.tsx
│   │   ├── Auth.tsx
│   │   ├── AvisoFuncionamientoAdmin.tsx
│   │   ├── ComprobanteDomicilioAdmin.tsx
│   │   ├── ConstanciaFiscalAdmin.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Documents.tsx
│   │   ├── DocumentsAdmin.tsx
│   │   ├── Index.tsx
│   │   ├── IneAdmin.tsx
│   │   ├── Invoices.tsx
│   │   ├── MedicineCounter.tsx
│   │   ├── Messages.tsx
│   │   ├── NotFound.tsx
│   │   ├── PurchaseOrders.tsx
│   │   └── SupplierDocuments.tsx
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   ├── count-medicine-boxes/
│   │   │   └── index.ts
│   │   ├── create-user/
│   │   │   └── index.ts
│   │   ├── delete-user/
│   │   │   └── index.ts
│   │   ├── extract-document-info/
│   │   │   └── index.ts
│   │   └── validate-invoice-xml/
│   │       └── index.ts
│   └── migrations/
│       └── [archivos de migración SQL]
├── .env
├── .gitignore
├── components.json
├── eslint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── README.md
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## ⚙️ CONFIGURACIÓN DEL PROYECTO

### 1. package.json

```json
{
  "name": "vite_react_shadcn_ts",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-aspect-ratio": "^1.1.7",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-context-menu": "^2.2.15",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-hover-card": "^1.1.14",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-menubar": "^1.1.15",
    "@radix-ui/react-navigation-menu": "^1.2.13",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slider": "^1.3.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-toggle": "^1.1.9",
    "@radix-ui/react-toggle-group": "^1.1.10",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@supabase/supabase-js": "^2.75.1",
    "@tanstack/react-query": "^5.83.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^3.6.0",
    "embla-carousel-react": "^8.6.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.462.0",
    "next-themes": "^0.3.0",
    "pdfjs-dist": "^5.4.296",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.61.1",
    "react-resizable-panels": "^2.1.9",
    "react-router-dom": "^6.30.1",
    "recharts": "^2.15.4",
    "sonner": "^1.7.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "vaul": "^0.9.9",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@eslint/js": "^9.32.0",
    "@tailwindcss/typography": "^0.5.16",
    "@types/node": "^22.16.5",
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react-swc": "^3.11.0",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.32.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^15.15.0",
    "lovable-tagger": "^1.1.11",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.38.0",
    "vite": "^5.4.19"
  }
}
```

### 2. vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Minificar el código en producción con esbuild (incluido en Vite)
    minify: mode === 'production' ? 'esbuild' : false,
    // Optimizar y proteger el código
    target: 'esnext',
    // Generar sourcemaps solo para desarrollo
    sourcemap: mode === 'development',
  },
  esbuild: {
    // En producción, eliminar console.log y debugger
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    // Minificar nombres en producción
    minifyIdentifiers: mode === 'production',
    minifySyntax: mode === 'production',
    minifyWhitespace: mode === 'production',
  },
}));
```

### 3. tailwind.config.ts

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

### 4. index.html

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>QualMedical - Gestión de Proveedores</title>
    <meta name="description" content="Sistema de gestión de proveedores QualMedical Farma" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## 💻 CÓDIGO FUENTE FRONTEND

### 1. src/main.tsx

```typescript
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

### 2. src/App.tsx

```typescript
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentsAdmin from "./pages/DocumentsAdmin";
import ConstanciaFiscalAdmin from "./pages/ConstanciaFiscalAdmin";
import ComprobanteDomicilioAdmin from "./pages/ComprobanteDomicilioAdmin";
import AvisoFuncionamientoAdmin from "./pages/AvisoFuncionamientoAdmin";
import Invoices from "./pages/Invoices";
import Messages from "./pages/Messages";
import PurchaseOrders from "./pages/PurchaseOrders";
import Admin from "./pages/Admin";
import MedicineCounter from "./pages/MedicineCounter";
import SupplierDocuments from "./pages/SupplierDocuments";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/documents" element={<Documents />} />
          <Route path="/dashboard/documents-admin" element={<DocumentsAdmin />} />
          <Route path="/dashboard/constancia-fiscal-admin" element={<ConstanciaFiscalAdmin />} />
          <Route path="/dashboard/comprobante-domicilio-admin" element={<ComprobanteDomicilioAdmin />} />
          <Route path="/dashboard/aviso-funcionamiento-admin" element={<AvisoFuncionamientoAdmin />} />
          <Route path="/dashboard/invoices" element={<Invoices />} />
          <Route path="/dashboard/messages" element={<Messages />} />
          <Route path="/dashboard/orders" element={<PurchaseOrders />} />
          <Route path="/dashboard/admin" element={<Admin />} />
          <Route path="/dashboard/medicine-counter" element={<MedicineCounter />} />
          <Route path="/dashboard/supplier-documents" element={<SupplierDocuments />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
```

### 3. src/index.css (Sistema de Diseño)

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

## 🎣 HOOKS PERSONALIZADOS

### 1. src/hooks/useAuth.tsx

```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const navigate = useNavigate();

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching role:", error);
        setUserRole(null);
        setRoleLoading(false);
        return;
      }

      setUserRole(data?.role || null);
      setRoleLoading(false);
    } catch (error) {
      console.error("Error in fetchUserRole:", error);
      setUserRole(null);
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        if (currentSession?.user) {
          setRoleLoading(true);
          // Defer Supabase calls with setTimeout to avoid blocking
          setTimeout(() => {
            fetchUserRole(currentSession.user.id);
          }, 0);
        } else {
          setUserRole(null);
          setRoleLoading(false);
        }
        
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (currentSession?.user) {
        setRoleLoading(true);
        // Defer Supabase calls with setTimeout
        setTimeout(() => {
          fetchUserRole(currentSession.user.id);
        }, 0);
      } else {
        setRoleLoading(false);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      // Clear local state first
      setUser(null);
      setSession(null);
      setUserRole(null);
      
      const { error } = await supabase.auth.signOut();
      
      // "Auth session missing" is not really an error - it means we're already logged out
      if (error && !error.message.includes("Auth session missing")) {
        console.error("SignOut error:", error);
        throw error;
      }
      
      toast.success("Sesión cerrada correctamente");
      navigate("/auth");
    } catch (error: any) {
      console.error("Error al cerrar sesión:", error);
      toast.error("Error al cerrar sesión: " + (error.message || "Error desconocido"));
      // Navigate anyway to clear the UI
      navigate("/auth");
    }
  };

  return {
    user,
    session,
    loading: loading || roleLoading,
    userRole,
    signOut,
    isAdmin: userRole === "admin",
    isSupplier: userRole === "proveedor",
  };
};
```

### 2. src/hooks/usePDFUpload.tsx

```typescript
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { convertPDFToImages } from '@/lib/pdfToImages';
import { toast } from 'sonner';

export interface UploadProgress {
  status: 'idle' | 'converting' | 'uploading' | 'complete' | 'error';
  currentPage?: number;
  totalPages?: number;
  message?: string;
}

export function usePDFUpload() {
  const [progress, setProgress] = useState<UploadProgress>({ status: 'idle' });

  const uploadPDFAsImages = async (
    file: File,
    documentId: string,
    basePath: string,
    maxPages: number = 20
  ): Promise<string[]> => {
    try {
      console.log(\`[PDF Upload] Iniciando carga - maxPages recibido: \${maxPages}\`);
      
      // Check if file is PDF
      if (!file.type.includes('pdf')) {
        throw new Error('El archivo debe ser un PDF');
      }

      setProgress({ status: 'converting', message: 'Convirtiendo PDF a imágenes...' });
      
      // Convert PDF to images
      const { images, totalPages } = await convertPDFToImages(file, maxPages);
      console.log(\`[PDF Upload] Conversión completada: \${images.length} imágenes de \${totalPages} páginas\`);
      
      setProgress({
        status: 'uploading',
        totalPages,
        currentPage: 0,
        message: \`Subiendo \${totalPages} páginas...\`,
      });

      const imageUrls: string[] = [];

      // Upload each image
      for (let i = 0; i < images.length; i++) {
        const imagePath = \`\${basePath}_page_\${i + 1}.png\`;
        
        setProgress({
          status: 'uploading',
          currentPage: i + 1,
          totalPages,
          message: \`Subiendo página \${i + 1} de \${totalPages}...\`,
        });

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(imagePath, images[i], {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(\`Error subiendo página \${i + 1}: \${uploadError.message}\`);
        }

        imageUrls.push(imagePath);
      }

      // Update document with image URLs
      const { error: updateError } = await supabase
        .from('documents')
        .update({ image_urls: imageUrls })
        .eq('id', documentId);

      if (updateError) {
        throw new Error(\`Error actualizando documento: \${updateError.message}\`);
      }

      setProgress({
        status: 'complete',
        message: \`\${totalPages} páginas subidas exitosamente\`,
      });

      return imageUrls;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setProgress({
        status: 'error',
        message: errorMessage,
      });
      toast.error(errorMessage);
      throw error;
    }
  };

  return {
    progress,
    uploadPDFAsImages,
    resetProgress: () => setProgress({ status: 'idle' }),
  };
}
```

---

## 🔧 UTILIDADES Y LIBRERÍAS

### src/lib/pdfToImages.ts

```typescript
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - using local worker from node_modules
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PDFToImagesResult {
  images: Blob[];
  totalPages: number;
}

export async function convertPDFToImages(
  pdfFile: File,
  maxPages: number = 20
): Promise<PDFToImagesResult> {
  try {
    console.log(\`[PDF Converter] Iniciando conversión - maxPages permitido: \${maxPages}\`);
    
    // Read PDF file as ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDocument = await loadingTask.promise;
    
    const totalPages = Math.min(pdfDocument.numPages, maxPages);
    console.log(\`[PDF Converter] PDF tiene \${pdfDocument.numPages} páginas. Procesaremos \${totalPages} páginas\`);
    const images: Blob[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(\`[PDF Converter] Procesando página \${pageNum} de \${totalPages}\`);
      const page = await pdfDocument.getPage(pageNum);
      
      // Set scale for better quality (2x)
      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      
      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Could not get canvas context');
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      await page.render(renderContext as any).promise;
      
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/png');
      });
      
      images.push(blob);
    }
    
    console.log(\`[PDF Converter] Conversión completada. Total de imágenes generadas: \${images.length}\`);
    
    return {
      images,
      totalPages,
    };
  } catch (error) {
    console.error('[PDF Converter] Error converting PDF to images:', error);
    throw error;
  }
}
```

---

## ⚡ EDGE FUNCTIONS (BACKEND)

### 1. supabase/functions/validate-invoice-xml/index.ts

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { xmlPath } = await req.json();

    if (!xmlPath) {
      throw new Error('xmlPath es requerido');
    }

    console.log('Descargando XML desde storage:', xmlPath);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: xmlData, error: downloadError } = await supabase.storage
      .from('invoices')
      .download(xmlPath);

    if (downloadError) {
      console.error('Error al descargar XML:', downloadError);
      throw new Error('Error al descargar el archivo XML del storage');
    }

    const xmlText = await xmlData.text();

    // Extraer información del XML usando regex
    const formaPagoMatch = xmlText.match(/FormaPago="([^"]+)"/);
    const metodoPagoMatch = xmlText.match(/MetodoPago="([^"]+)"/);
    const folioMatch = xmlText.match(/Folio="([^"]+)"/);
    const serieMatch = xmlText.match(/Serie="([^"]+)"/);
    const totalMatch = xmlText.match(/Total="([0-9.]+)"/);
    // ... más extracciones

    const formaPago = formaPagoMatch ? formaPagoMatch[1] : null;
    const metodoPago = metodoPagoMatch ? metodoPagoMatch[1] : null;

    // VALIDACIÓN CRÍTICA
    if (formaPago === '99' && metodoPago !== 'PPD') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validación de factura fallida',
          mensaje: 'Error en el XML: Cuando la Forma de Pago es 99, el Método de Pago debe ser PPD.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requiereComplemento = formaPago === '99' && metodoPago === 'PPD';

    return new Response(
      JSON.stringify({
        success: true,
        formaPago,
        metodoPago,
        // ... más datos extraídos
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
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### 2. supabase/functions/extract-document-info/index.ts

**Nota:** Este archivo es muy largo (1000+ líneas). Aquí está una versión resumida:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompts de validación según tipo de documento
function getValidationPrompt(documentType: string): string {
  const prompts: Record<string, string> = {
    'acta_constitutiva': 'Analiza esta imagen y determina si contiene información de un ACTA CONSTITUTIVA...',
    'constancia_fiscal': 'Analiza esta imagen y determina si contiene información de una CONSTANCIA DE SITUACIÓN FISCAL...',
    'comprobante_domicilio': 'Analiza esta imagen y determina si contiene información de un COMPROBANTE DE DOMICILIO...',
    // ... más prompts
  };
  return prompts[documentType] || 'Analiza si este documento es válido.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Obtener documento
    const { data: document } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    // Descargar imagen
    const { data: fileData } = await supabaseClient.storage
      .from('documents')
      .download(imageToProcess);

    // Convertir a base64
    const base64Data = /* ... */;

    // PASO 1: Validar autenticidad con IA
    const validationResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': \`Bearer \${LOVABLE_API_KEY}\` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [/* validación */],
        tools: [/* función validate_document */]
      })
    });

    const validationResult = /* parsear respuesta */;

    // Si no es válido, rechazar
    if (!validationResult.is_valid_type) {
      await supabaseClient.from('documents')
        .update({ extraction_status: 'failed', is_valid: false })
        .eq('id', documentId);
      
      return new Response(JSON.stringify({ error: 'Documento no válido' }), { status: 400 });
    }

    // PASO 2: Extraer información específica según tipo de documento
    const extractionResponse = await fetch(/* segunda llamada a IA */);
    
    const extractedData = /* parsear datos extraídos */;

    // Guardar datos extraídos en la BD
    await supabaseClient.from('documents')
      .update({ extraction_status: 'completed', extracted_data: extractedData })
      .eq('id', documentId);

    return new Response(JSON.stringify({ success: true, data: extractedData }));

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
```

### 3. supabase/functions/count-medicine-boxes/index.ts

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No se proporcionó imagen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${LOVABLE_API_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Eres un experto en análisis de imágenes de inventarios médicos."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analiza esta imagen y cuenta el número total de cajas de medicamentos."
              },
              {
                type: "image_url",
                image_url: { url: imageBase64 }
              }
            ]
          }
        ]
      }),
    });

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;

    // Extraer el número de cajas
    const countMatch = analysis.match(/Total de cajas:\\s*(\\d+)/i);
    const count = countMatch ? parseInt(countMatch[1]) : null;

    return new Response(
      JSON.stringify({ count, analysis, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 🗄️ ESTRUCTURA DE BASE DE DATOS

### Tablas Principales:

1. **profiles** - Perfiles de usuario extendidos
2. **user_roles** - Roles de usuario (admin/proveedor)
3. **documents** - Documentos subidos por proveedores
4. **invoices** - Facturas con validación XML
5. **invoice_items** - Conceptos/artículos de facturas
6. **messages** - Sistema de mensajería
7. **purchase_orders** - Órdenes de compra

### Storage Buckets:

1. **documents** - Almacenamiento de documentos (PDFs e imágenes)
2. **invoices** - Almacenamiento de facturas (PDF y XML)

### Políticas RLS:

- Todos los documentos y facturas están protegidos por RLS
- Proveedores solo ven sus propios datos
- Administradores tienen acceso completo

---

## 📝 INSTRUCCIONES DE RESTAURACIÓN

### Requisitos Previos:

```bash
- Node.js v18 o superior
- npm o yarn
- Cuenta de Supabase (opcional si usas Lovable Cloud)
```

### Pasos de Instalación:

1. **Clonar/Crear el proyecto:**
```bash
mkdir qualmedical-project
cd qualmedical-project
```

2. **Crear package.json:**
   - Copiar el contenido del package.json de este documento

3. **Instalar dependencias:**
```bash
npm install
```

4. **Crear estructura de carpetas:**
   - Seguir la estructura de directorios mostrada arriba
   - Copiar todos los archivos de código fuente

5. **Configurar variables de entorno (.env):**
```env
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=tu_supabase_anon_key
VITE_SUPABASE_PROJECT_ID=tu_project_id
```

6. **Configurar Supabase:**
   - Crear proyecto en Supabase
   - Ejecutar migraciones SQL
   - Configurar storage buckets
   - Desplegar edge functions

7. **Ejecutar en desarrollo:**
```bash
npm run dev
```

8. **Compilar para producción:**
```bash
npm run build
```

---

## 📊 CARACTERÍSTICAS CLAVE DEL SISTEMA

### 1. Validación de Documentos con IA
- Extracción automática de datos de Actas Constitutivas
- Validación de Constancias de Situación Fiscal
- Verificación de Comprobantes de Domicilio
- Análisis de Avisos de Funcionamiento
- Validación de credenciales INE

### 2. Sistema de Facturas Electrónicas
- Validación automática de XML CFDI 4.0
- Verificación de FormaPago y MetodoPago
- Extracción de conceptos y montos
- Gestión de complementos de pago
- Validación de estructura XML

### 3. Conversión PDF a Imágenes
- Procesamiento automático de PDFs multipágina
- Hasta 20 páginas estándar
- Hasta 50 páginas para Actas Constitutivas
- Optimización de calidad de imagen

### 4. Contador de Medicamentos
- Análisis de imágenes con IA
- Conteo automático de cajas
- Descripción de organización

### 5. Seguridad
- Autenticación con Supabase Auth
- Row Level Security (RLS)
- Validación de archivos (tamaño, tipo)
- Sanitización de inputs
- Roles y permisos

---

## 🔐 NOTAS DE SEGURIDAD

### Validaciones Implementadas:
1. Tamaño máximo de archivos: 10MB (20MB para Actas)
2. Tipos de archivo permitidos: JPG, PNG, PDF
3. Validación de nombres de archivo
4. Sanitización de datos antes de insertar en BD
5. Protección contra inyección SQL
6. RLS en todas las tablas sensibles
7. Tokens JWT para autenticación
8. CORS configurado correctamente

### Recomendaciones Adicionales:
- Mantener las Edge Functions actualizadas
- Revisar logs regularmente
- Implementar rate limiting en producción
- Configurar backups automáticos de la BD
- Monitorear uso de almacenamiento

---

## 📞 INFORMACIÓN DE CONTACTO

**Proyecto:** QualMedical Provider Management System  
**Versión:** 1.0.0  
**Fecha:** Octubre 2025  
**Tecnología:** React + TypeScript + Supabase  

---

## 📋 CHECKLIST DE RESTAURACIÓN

- [ ] Crear estructura de carpetas
- [ ] Copiar package.json
- [ ] Instalar dependencias (npm install)
- [ ] Crear archivos de configuración (vite.config.ts, tailwind.config.ts)
- [ ] Copiar código fuente de src/
- [ ] Copiar edge functions de supabase/functions/
- [ ] Configurar variables de entorno (.env)
- [ ] Crear proyecto Supabase
- [ ] Ejecutar migraciones SQL
- [ ] Configurar storage buckets
- [ ] Desplegar edge functions
- [ ] Probar en desarrollo (npm run dev)
- [ ] Compilar para producción (npm run build)

---

**FIN DEL DOCUMENTO**

*Este documento contiene el código fuente completo y la documentación necesaria para restaurar el proyecto QualMedical Provider Management System.*
