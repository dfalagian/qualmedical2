# INFORME COMPLETO: Sistema de Backup de Base de Datos

**Fecha de generación:** 2025-12-06  
**Sistema:** QualMedical - Portal de Proveedores  
**Propósito:** Documentación técnica para replicar funcionalidades en otro sistema

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Edge Function: export-database-schema](#3-edge-function-export-database-schema)
4. [Edge Function: export-database-full](#4-edge-function-export-database-full)
5. [Componente Frontend: DatabaseBackup](#5-componente-frontend-databasebackup)
6. [Configuración Requerida](#6-configuración-requerida)
7. [Formato del Script SQL Generado](#7-formato-del-script-sql-generado)
8. [Instrucciones de Implementación](#8-instrucciones-de-implementación)

---

## 1. RESUMEN EJECUTIVO

El sistema de backup consta de **dos funcionalidades principales**:

| Funcionalidad | Descripción | Archivo Generado |
|---------------|-------------|------------------|
| **Exportar Estructura** | Solo esquema de BD (tablas, funciones, triggers, RLS) | `{proyecto}_schema_{fecha}.sql` |
| **Backup Completo** | Esquema + todos los datos de todas las tablas | `{proyecto}_backup_completo_{fecha}.sql` |

**Tecnologías utilizadas:**
- **Backend:** Supabase Edge Functions (Deno)
- **Frontend:** React + TypeScript
- **Base de datos:** PostgreSQL (via Supabase)
- **Driver PostgreSQL:** deno.land/x/postgres@v0.17.0

---

## 2. ARQUITECTURA DEL SISTEMA

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│                    DatabaseBackup.tsx                            │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ Botón "Exportar     │    │ Botón "Backup Completo          │ │
│  │ Estructura"         │    │ con Datos"                      │ │
│  └──────────┬──────────┘    └──────────────┬──────────────────┘ │
└─────────────┼──────────────────────────────┼────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE FUNCTIONS (Deno)                         │
│  ┌──────────────────────┐    ┌─────────────────────────────────┐│
│  │export-database-schema│    │   export-database-full          ││
│  │                      │    │                                 ││
│  │ • Tipos ENUM         │    │ • Todo lo de schema +           ││
│  │ • Tablas/Columnas    │    │ • INSERTs de todos los datos    ││
│  │ • Constraints        │    │ • Ordenado por foreign keys     ││
│  │ • Foreign Keys       │    │                                 ││
│  │ • Funciones          │    │                                 ││
│  │ • Triggers           │    │                                 ││
│  │ • RLS Policies       │    │                                 ││
│  └──────────┬───────────┘    └──────────────┬──────────────────┘│
└─────────────┼──────────────────────────────┼────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                         │
│                (Acceso directo via SUPABASE_DB_URL)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. EDGE FUNCTION: export-database-schema

### 3.1 Ubicación
```
supabase/functions/export-database-schema/index.ts
```

### 3.2 Propósito
Exporta **únicamente la estructura** de la base de datos, sin datos. Útil para:
- Crear un nuevo ambiente vacío
- Documentar el esquema actual
- Migrar estructura a otro servidor

### 3.3 Código Completo

```typescript
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnumType {
  typname: string;
  enumlabel: string;
}

interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string;
}

interface ForeignKey {
  constraint_name: string;
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

interface Function {
  proname: string;
  prosrc: string;
  prorettype: string;
  proargtypes: string;
  provolatile: string;
  prosecdef: boolean;
}

interface Trigger {
  trigger_name: string;
  event_manipulation: string;
  event_object_table: string;
  action_statement: string;
  action_timing: string;
}

interface Policy {
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string;
  with_check: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL')!;
    const client = new Client(databaseUrl);

    let sqlScript = `-- Database Schema Export
-- Generated: ${new Date().toISOString()}
-- 
-- Este script puede ejecutarse en cualquier PostgreSQL para recrear la estructura
-- de la base de datos completa.

-- ============================================================================
-- EXTENSIONES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;

    await client.connect();

    // 1. Obtener y exportar ENUMS
    console.log('Exportando tipos enum...');
    const enumsResult = await client.queryObject<EnumType>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `;
    const enums = enumsResult.rows;

    if (enums && enums.length > 0) {
      sqlScript += `-- ============================================================================
-- TIPOS ENUM
-- ============================================================================\n`;
      
      const enumsByType = enums.reduce((acc: Record<string, string[]>, curr) => {
        if (!acc[curr.typname]) acc[curr.typname] = [];
        acc[curr.typname].push(curr.enumlabel);
        return acc;
      }, {});

      for (const [typeName, labels] of Object.entries(enumsByType)) {
        sqlScript += `CREATE TYPE public.${typeName} AS ENUM (${labels.map(l => `'${l}'`).join(', ')});\n`;
      }
      sqlScript += '\n';
    }

    // 2. Obtener y exportar TABLAS con columnas
    console.log('Exportando tablas...');
    const tablesResult = await client.queryObject<{ table_name: string }>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const tables = tablesResult.rows;

    if (tables && tables.length > 0) {
      sqlScript += `-- ============================================================================
-- TABLAS
-- ============================================================================\n`;

      for (const table of tables) {
        const columnsResult = await client.queryObject<Column>`
          SELECT 
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.column_default
          FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = ${table.table_name}
          ORDER BY c.ordinal_position
        `;
        const columns = columnsResult.rows;

        sqlScript += `\nCREATE TABLE public.${table.table_name} (\n`;
        
        const columnDefs = columns.map(col => {
          let def = `  ${col.column_name} `;
          
          if (col.data_type === 'USER-DEFINED') {
            def += `public.${col.udt_name}`;
          } else if (col.data_type === 'ARRAY') {
            def += `${col.udt_name}[]`;
          } else {
            def += col.data_type;
          }
          
          if (col.is_nullable === 'NO') def += ' NOT NULL';
          if (col.column_default) def += ` DEFAULT ${col.column_default}`;
          
          return def;
        });

        sqlScript += columnDefs.join(',\n') + '\n);\n';
      }
      sqlScript += '\n';
    }

    // 3. Obtener y exportar PRIMARY KEYS y UNIQUE CONSTRAINTS
    console.log('Exportando constraints...');
    sqlScript += `-- ============================================================================
-- PRIMARY KEYS Y CONSTRAINTS
-- ============================================================================\n`;

    for (const table of tables) {
      const constraintsResult = await client.queryObject<{ constraint_name: string; constraint_type: string; column_name: string }>`
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = ${table.table_name}
          AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
        ORDER BY tc.constraint_type, kcu.ordinal_position
      `;
      const constraints = constraintsResult.rows;

      if (constraints && constraints.length > 0) {
        for (const constraint of constraints) {
          if (constraint.constraint_type === 'PRIMARY KEY') {
            sqlScript += `ALTER TABLE public.${table.table_name} ADD PRIMARY KEY (${constraint.column_name});\n`;
          } else if (constraint.constraint_type === 'UNIQUE') {
            sqlScript += `ALTER TABLE public.${table.table_name} ADD CONSTRAINT ${constraint.constraint_name} UNIQUE (${constraint.column_name});\n`;
          }
        }
      }
    }
    sqlScript += '\n';

    // 4. Obtener y exportar FOREIGN KEYS
    console.log('Exportando foreign keys...');
    const foreignKeysResult = await client.queryObject<ForeignKey>`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `;
    const foreignKeys = foreignKeysResult.rows;

    if (foreignKeys && foreignKeys.length > 0) {
      sqlScript += `-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================\n`;
      
      for (const fk of foreignKeys) {
        sqlScript += `ALTER TABLE public.${fk.table_name} 
  ADD CONSTRAINT ${fk.constraint_name} 
  FOREIGN KEY (${fk.column_name}) 
  REFERENCES public.${fk.foreign_table_name}(${fk.foreign_column_name}) 
  ON DELETE CASCADE;\n`;
      }
      sqlScript += '\n';
    }

    // 5. Obtener y exportar FUNCIONES
    console.log('Exportando funciones...');
    const functionsResult = await client.queryObject<{ proname: string; definition: string }>`
      SELECT 
        p.proname,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      ORDER BY p.proname
    `;
    const functions = functionsResult.rows;

    if (functions && functions.length > 0) {
      sqlScript += `-- ============================================================================
-- FUNCIONES
-- ============================================================================\n`;
      
      for (const func of functions) {
        sqlScript += `${func.definition}\n\n`;
      }
    }

    // 6. Obtener y exportar TRIGGERS
    console.log('Exportando triggers...');
    const triggersResult = await client.queryObject<{ trigger_name: string; table_name: string; definition: string }>`
      SELECT 
        t.tgname as trigger_name,
        c.relname as table_name,
        pg_get_triggerdef(t.oid) as definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname
    `;
    const triggers = triggersResult.rows;

    if (triggers && triggers.length > 0) {
      sqlScript += `-- ============================================================================
-- TRIGGERS
-- ============================================================================\n`;
      
      for (const trigger of triggers) {
        sqlScript += `${trigger.definition};\n`;
      }
      sqlScript += '\n';
    }

    // 7. Habilitar RLS en todas las tablas
    console.log('Exportando RLS...');
    sqlScript += `-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================\n`;
    
    for (const table of tables) {
      sqlScript += `ALTER TABLE public.${table.table_name} ENABLE ROW LEVEL SECURITY;\n`;
    }
    sqlScript += '\n';

    // 8. Obtener y exportar POLÍTICAS RLS
    console.log('Exportando políticas RLS...');
    const policiesResult = await client.queryObject<Policy>`
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `;
    const policies = policiesResult.rows;

    if (policies && policies.length > 0) {
      sqlScript += `-- ============================================================================
-- POLÍTICAS RLS
-- ============================================================================\n`;
      
      for (const policy of policies) {
        const policyType = policy.permissive === 'PERMISSIVE' ? 'AS PERMISSIVE' : 'AS RESTRICTIVE';
        const roles = policy.roles.join(', ');
        
        sqlScript += `CREATE POLICY "${policy.policyname}"\n`;
        sqlScript += `  ON public.${policy.tablename}\n`;
        sqlScript += `  ${policyType}\n`;
        sqlScript += `  FOR ${policy.cmd}\n`;
        sqlScript += `  TO ${roles}\n`;
        
        if (policy.qual) {
          sqlScript += `  USING (${policy.qual})`;
        }
        
        if (policy.with_check) {
          if (policy.qual) sqlScript += '\n';
          sqlScript += `  WITH CHECK (${policy.with_check})`;
        }
        
        sqlScript += ';\n\n';
      }
    }

    sqlScript += `-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
-- Script generado exitosamente
-- Total de tablas: ${tables.length}
-- Total de funciones: ${functions?.length || 0}
-- Total de triggers: ${triggers?.length || 0}
-- Total de políticas: ${policies?.length || 0}
`;

    await client.end();

    return new Response(
      JSON.stringify({ 
        success: true, 
        script: sqlScript,
        stats: {
          tables: tables.length,
          functions: functions?.length || 0,
          triggers: triggers?.length || 0,
          policies: policies?.length || 0
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error al exportar schema:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
```

### 3.4 Elementos Exportados

| Elemento | Query SQL Usada | Descripción |
|----------|-----------------|-------------|
| ENUMs | `pg_type + pg_enum` | Tipos enumerados personalizados |
| Tablas | `information_schema.tables` | Estructura de todas las tablas |
| Columnas | `information_schema.columns` | Definición de columnas con tipos y defaults |
| Primary Keys | `information_schema.table_constraints` | Claves primarias |
| Unique Constraints | `information_schema.table_constraints` | Restricciones únicas |
| Foreign Keys | `information_schema.constraint_column_usage` | Relaciones entre tablas |
| Funciones | `pg_proc + pg_get_functiondef()` | Funciones PL/pgSQL |
| Triggers | `pg_trigger + pg_get_triggerdef()` | Triggers de la BD |
| RLS Enable | Manual por cada tabla | Habilita Row Level Security |
| RLS Policies | `pg_policies` | Políticas de seguridad |

---

## 4. EDGE FUNCTION: export-database-full

### 4.1 Ubicación
```
supabase/functions/export-database-full/index.ts
```

### 4.2 Propósito
Exporta **estructura completa + todos los datos** de todas las tablas. Útil para:
- Backup completo del sistema
- Migración a otro servidor con datos
- Recuperación ante desastres

### 4.3 Código Completo

```typescript
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TableRow {
  [key: string]: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL')!;
    const client = new Client(databaseUrl);

    let sqlScript = `-- Database Full Backup (Schema + Data)
-- Generated: ${new Date().toISOString()}
-- 
-- Este script contiene la estructura completa Y todos los datos del sistema.
-- ADVERTENCIA: Este archivo contiene información sensible.

-- ============================================================================
-- EXTENSIONES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;

    await client.connect();

    // [... Mismo código de estructura que export-database-schema ...]
    // Secciones 1-8 son idénticas

    // 9. EXPORTAR DATOS DE TODAS LAS TABLAS
    console.log('Exportando datos de tablas...');
    sqlScript += `-- ============================================================================
-- DATOS DE LAS TABLAS
-- ============================================================================\n`;

    let totalRows = 0;
    const tableRowCounts: Record<string, number> = {};

    // Orden de tablas para evitar conflictos de foreign keys
    const tableOrder = [
      'profiles',
      'user_roles', 
      'documents',
      'document_versions',
      'purchase_orders',
      'invoices',
      'invoice_items',
      'pagos',
      'messages',
      'medicine_counts'
    ];

    // Ordenar tablas según el orden definido
    const orderedTables = [...tables].sort((a, b) => {
      const indexA = tableOrder.indexOf(a.table_name);
      const indexB = tableOrder.indexOf(b.table_name);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    for (const table of orderedTables) {
      const tableName = table.table_name;
      const columns = tableColumns[tableName];
      
      if (!columns || columns.length === 0) continue;

      try {
        // Obtener todos los datos de la tabla
        const dataResult = await client.queryObject<TableRow>(
          `SELECT * FROM public.${tableName} ORDER BY created_at ASC NULLS FIRST`
        );
        const rows = dataResult.rows;

        if (rows && rows.length > 0) {
          tableRowCounts[tableName] = rows.length;
          totalRows += rows.length;

          sqlScript += `\n-- Datos de tabla: ${tableName} (${rows.length} registros)\n`;

          for (const row of rows) {
            const values = columns.map(col => {
              const value = row[col];
              
              if (value === null || value === undefined) {
                return 'NULL';
              }
              
              if (typeof value === 'boolean') {
                return value ? 'TRUE' : 'FALSE';
              }
              
              if (typeof value === 'number') {
                return value.toString();
              }
              
              if (value instanceof Date) {
                return `'${value.toISOString()}'`;
              }
              
              if (Array.isArray(value)) {
                const escapedArray = value.map(v => 
                  typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : v
                );
                return `ARRAY[${escapedArray.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')}]`;
              }
              
              if (typeof value === 'object') {
                return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
              }
              
              // String - escapar comillas simples
              return `'${String(value).replace(/'/g, "''")}'`;
            });

            sqlScript += `INSERT INTO public.${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
          }
        }
      } catch (tableError) {
        console.error(`Error exportando datos de ${tableName}:`, tableError);
        sqlScript += `-- Error exportando datos de ${tableName}: ${tableError}\n`;
      }
    }

    sqlScript += `\n-- ============================================================================
-- FIN DEL BACKUP COMPLETO
-- ============================================================================
-- Total de tablas: ${tables.length}
-- Total de funciones: ${functions?.length || 0}
-- Total de triggers: ${triggers?.length || 0}
-- Total de políticas: ${policies?.length || 0}
-- Total de registros exportados: ${totalRows}
-- Detalle por tabla:
${Object.entries(tableRowCounts).map(([table, count]) => `--   ${table}: ${count} registros`).join('\n')}
`;

    await client.end();

    return new Response(
      JSON.stringify({ 
        success: true, 
        script: sqlScript,
        stats: {
          tables: tables.length,
          functions: functions?.length || 0,
          triggers: triggers?.length || 0,
          policies: policies?.length || 0,
          totalRows,
          tableRowCounts
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error al exportar backup completo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
```

### 4.4 Diferencias con export-database-schema

| Aspecto | export-database-schema | export-database-full |
|---------|------------------------|----------------------|
| Estructura | ✅ Sí | ✅ Sí |
| Datos | ❌ No | ✅ Sí |
| Orden de tablas | No importa | Ordenado por FK |
| Tamaño archivo | Pequeño (~50KB) | Grande (depende de datos) |
| Información sensible | No | ⚠️ SÍ |

### 4.5 Manejo de Tipos de Datos

El sistema maneja correctamente los siguientes tipos:

| Tipo PostgreSQL | Conversión SQL |
|-----------------|----------------|
| `NULL` | `NULL` |
| `boolean` | `TRUE` / `FALSE` |
| `number` | Valor directo |
| `Date` | `'ISO-8601-string'` |
| `ARRAY` | `ARRAY['val1', 'val2']` |
| `JSONB` | `'{...}'::jsonb` |
| `string` | `'valor'` (con escape de comillas) |

### 4.6 Orden de Exportación de Tablas

Para evitar errores de foreign keys, las tablas se exportan en este orden:

1. `profiles` (tabla padre principal)
2. `user_roles` (depende de profiles)
3. `documents` (depende de profiles)
4. `document_versions` (depende de documents)
5. `purchase_orders` (depende de profiles)
6. `invoices` (depende de profiles)
7. `invoice_items` (depende de invoices)
8. `pagos` (depende de invoices, documents)
9. `messages` (depende de profiles)
10. `medicine_counts` (depende de profiles)

---

## 5. COMPONENTE FRONTEND: DatabaseBackup

### 5.1 Ubicación
```
src/pages/DatabaseBackup.tsx
```

### 5.2 Características

- **Acceso restringido:** Solo usuarios admin
- **Dos botones de acción:** Estructura y Backup Completo
- **Indicadores de progreso:** Spinner mientras genera
- **Estadísticas post-export:** Muestra conteo de elementos
- **Descarga automática:** Archivo .sql con fecha

### 5.3 Código del Componente

```typescript
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Download, Loader2, AlertCircle, CheckCircle2, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface BackupStats {
  tables: number;
  functions: number;
  triggers: number;
  policies: number;
  totalRows?: number;
  tableRowCounts?: Record<string, number>;
}

const DatabaseBackup = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [isExportingSchema, setIsExportingSchema] = useState(false);
  const [isExportingFull, setIsExportingFull] = useState(false);
  const [schemaStats, setSchemaStats] = useState<BackupStats | null>(null);
  const [fullStats, setFullStats] = useState<BackupStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/");
    }
  }, [user, isAdmin, loading, navigate]);

  const handleExportSchema = async () => {
    setIsExportingSchema(true);
    setError(null);
    setSchemaStats(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('export-database-schema');

      if (functionError) throw functionError;

      if (data.success) {
        // Crear blob y descargar
        const blob = new Blob([data.script], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `proyecto_schema_${new Date().toISOString().split('T')[0]}.sql`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setSchemaStats(data.stats);
        toast.success("Estructura exportada exitosamente");
      } else {
        throw new Error(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al exportar';
      setError(errorMessage);
      toast.error("Error al exportar estructura");
    } finally {
      setIsExportingSchema(false);
    }
  };

  const handleExportFull = async () => {
    setIsExportingFull(true);
    setError(null);
    setFullStats(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('export-database-full');

      if (functionError) throw functionError;

      if (data.success) {
        const blob = new Blob([data.script], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `proyecto_backup_completo_${new Date().toISOString().split('T')[0]}.sql`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setFullStats(data.stats);
        toast.success("Backup completo exportado");
      } else {
        throw new Error(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al exportar';
      setError(errorMessage);
      toast.error("Error al exportar backup");
    } finally {
      setIsExportingFull(false);
    }
  };

  // ... render del componente con Cards y botones
};

export default DatabaseBackup;
```

---

## 6. CONFIGURACIÓN REQUERIDA

### 6.1 Secretos/Variables de Entorno

| Variable | Descripción | Dónde configurar |
|----------|-------------|------------------|
| `SUPABASE_DB_URL` | URL de conexión directa a PostgreSQL | Secrets de Supabase |

**Formato de SUPABASE_DB_URL:**
```
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

### 6.2 Configuración de Edge Functions (config.toml)

```toml
project_id = "tu-project-id"

[functions.export-database-schema]
verify_jwt = true

[functions.export-database-full]
verify_jwt = true
```

### 6.3 Ruta en el Router

```typescript
// En App.tsx o router principal
<Route path="/dashboard/database-backup" element={<DatabaseBackup />} />
```

### 6.4 Navegación (Sidebar)

```typescript
// Agregar al menú de admin
{
  icon: Database,
  label: "Backup BD",
  path: "/dashboard/database-backup",
  adminOnly: true
}
```

---

## 7. FORMATO DEL SCRIPT SQL GENERADO

### 7.1 Estructura del Archivo

```sql
-- Database Schema Export / Full Backup
-- Generated: 2025-12-06T10:30:00.000Z

-- ============================================================================
-- EXTENSIONES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TIPOS ENUM
-- ============================================================================
CREATE TYPE public.document_status AS ENUM ('pendiente', 'aprobado', 'rechazado');
CREATE TYPE public.payment_status AS ENUM ('pendiente', 'procesando', 'pagado', 'rechazado', 'cancelado');

-- ============================================================================
-- TABLAS
-- ============================================================================
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  ...
);

-- ============================================================================
-- PRIMARY KEYS Y CONSTRAINTS
-- ============================================================================
ALTER TABLE public.profiles ADD PRIMARY KEY (id);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================
ALTER TABLE public.invoices 
  ADD CONSTRAINT invoices_supplier_id_fkey 
  FOREIGN KEY (supplier_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- ============================================================================
-- FUNCIONES
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
...

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE TRIGGER update_profiles_updated_at ...

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS RLS
-- ============================================================================
CREATE POLICY "Los admins pueden ver todos los perfiles"
  ON public.profiles
  AS RESTRICTIVE
  FOR SELECT
  TO public
  USING (is_admin(auth.uid()));

-- ============================================================================
-- DATOS DE LAS TABLAS (solo en backup completo)
-- ============================================================================
INSERT INTO public.profiles (id, email, full_name) VALUES ('uuid-1', 'admin@email.com', 'Admin');

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
-- Total de tablas: 10
-- Total de funciones: 9
-- Total de triggers: 4
-- Total de políticas: 50
-- Total de registros exportados: 1234
```

---

## 8. INSTRUCCIONES DE IMPLEMENTACIÓN

### 8.1 Paso a Paso para Replicar

1. **Crear las Edge Functions:**
   - Crear carpeta `supabase/functions/export-database-schema/`
   - Crear archivo `index.ts` con el código
   - Repetir para `export-database-full/`

2. **Configurar config.toml:**
   ```toml
   [functions.export-database-schema]
   verify_jwt = true
   
   [functions.export-database-full]
   verify_jwt = true
   ```

3. **Configurar el secreto SUPABASE_DB_URL:**
   - Ir a Settings > Secrets en Supabase
   - Agregar `SUPABASE_DB_URL` con la connection string

4. **Crear el componente React:**
   - Crear `src/pages/DatabaseBackup.tsx`
   - Importar componentes UI necesarios

5. **Agregar la ruta:**
   - Agregar al router con protección de admin

6. **Agregar al menú de navegación:**
   - Solo visible para administradores

### 8.2 Adaptaciones Necesarias para Otro Sistema

| Aspecto | Qué Cambiar |
|---------|-------------|
| Nombre del proyecto | Header del SQL y nombre del archivo |
| Orden de tablas | Array `tableOrder` según las FK del nuevo sistema |
| Columnas de ordenación | `ORDER BY created_at` si existe esa columna |
| Verificación de admin | Hook `useAuth` y función `isAdmin` |
| Componentes UI | Adaptar imports de shadcn/ui |

---

## RESUMEN FINAL

Este sistema provee una solución completa de backup para bases de datos PostgreSQL en Supabase, con:

✅ Exportación de estructura completa  
✅ Exportación de datos con manejo de tipos  
✅ Ordenamiento por foreign keys  
✅ Interfaz de usuario intuitiva  
✅ Acceso restringido a administradores  
✅ Descarga automática de archivos  
✅ Estadísticas post-exportación  

**Archivos clave a copiar:**
1. `supabase/functions/export-database-schema/index.ts`
2. `supabase/functions/export-database-full/index.ts`
3. `src/pages/DatabaseBackup.tsx`
4. Configuración en `supabase/config.toml`
