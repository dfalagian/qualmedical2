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

    let sqlScript = `-- QualMedical Database Schema Export
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
