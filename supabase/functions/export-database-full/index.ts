import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatValue(value: unknown, udtName: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (value instanceof Uint8Array) {
    let hex = '';
    for (const b of value) hex += b.toString(16).padStart(2, '0');
    return `'\\x${hex}'::bytea`;
  }
  if (Array.isArray(value)) {
    const inner = value.map(v => {
      if (v === null) return 'NULL';
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    });
    return `'{${inner.join(',')}}'`;
  }
  if (typeof value === 'object') {
    const cast = udtName === 'jsonb' ? '::jsonb' : '::json';
    return `'${JSON.stringify(value).replace(/'/g, "''")}'${cast}`;
  }
  const str = String(value).replace(/'/g, "''");
  if (udtName && udtName !== 'text' && udtName !== 'varchar' && udtName !== 'bpchar' && udtName !== 'name') {
    // user-defined types, uuid, dates, etc need cast for safety in some cases; uuid/timestamps work with plain quotes
    return `'${str}'`;
  }
  return `'${str}'`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL')!;
    const client = new Client(databaseUrl);
    await client.connect();

    let sqlScript = `-- QualMedical Database Full Backup (Schema + Data)
-- Generated: ${new Date().toISOString()}
-- ADVERTENCIA: Contiene informaciÃ³n sensible. ManÃ©jelo con cuidado.

SET session_replication_role = 'replica';  -- Desactiva triggers/FKs durante la carga
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;

    // ENUMS
    const enums = (await client.queryObject<{ typname: string; enumlabel: string }>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `).rows;
    if (enums.length > 0) {
      sqlScript += `-- ==== ENUMS ====\n`;
      const byType: Record<string, string[]> = {};
      for (const e of enums) (byType[e.typname] ||= []).push(e.enumlabel);
      for (const [name, labels] of Object.entries(byType)) {
        sqlScript += `DO $$ BEGIN CREATE TYPE public.${name} AS ENUM (${labels.map(l => `'${l.replace(/'/g, "''")}'`).join(', ')}); EXCEPTION WHEN duplicate_object THEN null; END $$;\n`;
      }
      sqlScript += '\n';
    }

    // SECUENCIAS
    const sequences = (await client.queryObject<{ sequence_name: string }>`
      SELECT sequence_name FROM information_schema.sequences
      WHERE sequence_schema = 'public' ORDER BY sequence_name
    `).rows;
    if (sequences.length > 0) {
      sqlScript += `-- ==== SECUENCIAS ====\n`;
      for (const s of sequences) {
        sqlScript += `CREATE SEQUENCE IF NOT EXISTS public.${s.sequence_name};\n`;
      }
      sqlScript += '\n';
    }

    // TABLAS
    const tables = (await client.queryObject<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `).rows;

    const tableColumns: Record<string, { name: string; udt: string }[]> = {};
    sqlScript += `-- ==== TABLAS ====\n`;
    for (const t of tables) {
      const cols = (await client.queryObject<{
        column_name: string; data_type: string; udt_name: string;
        is_nullable: string; column_default: string | null;
      }>`
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${t.table_name}
        ORDER BY ordinal_position
      `).rows;

      tableColumns[t.table_name] = cols.map(c => ({ name: c.column_name, udt: c.udt_name }));

      sqlScript += `\nCREATE TABLE IF NOT EXISTS public.${t.table_name} (\n`;
      sqlScript += cols.map(c => {
        let type: string;
        if (c.data_type === 'USER-DEFINED') type = `public.${c.udt_name}`;
        else if (c.data_type === 'ARRAY') type = `${c.udt_name.replace(/^_/, '')}[]`;
        else type = c.data_type;
        let def = `  ${c.column_name} ${type}`;
        if (c.is_nullable === 'NO') def += ' NOT NULL';
        if (c.column_default) def += ` DEFAULT ${c.column_default}`;
        return def;
      }).join(',\n') + '\n);\n';
    }
    sqlScript += '\n';

    // PK / UNIQUE agrupadas
    sqlScript += `-- ==== PRIMARY KEYS Y UNIQUE ====\n`;
    const pkUnique = (await client.queryObject<{
      table_name: string; constraint_name: string; constraint_type: string;
      column_name: string;
    }>`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
      ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    `).rows;
    const grouped: Record<string, { table: string; type: string; cols: string[] }> = {};
    for (const r of pkUnique) {
      const k = `${r.table_name}|${r.constraint_name}`;
      (grouped[k] ||= { table: r.table_name, type: r.constraint_type, cols: [] }).cols.push(r.column_name);
    }
    for (const [k, g] of Object.entries(grouped)) {
      const cname = k.split('|')[1];
      const kind = g.type === 'PRIMARY KEY' ? 'PRIMARY KEY' : 'UNIQUE';
      sqlScript += `ALTER TABLE public.${g.table} ADD CONSTRAINT ${cname} ${kind} (${g.cols.join(', ')});\n`;
    }
    sqlScript += '\n';

    // FKs con reglas reales
    const fks = (await client.queryObject<{
      conname: string; table_name: string; columns: string;
      foreign_table: string; foreign_columns: string;
      delete_rule: string; update_rule: string;
    }>`
      SELECT c.conname,
             cl.relname AS table_name,
             string_agg(att.attname, ',' ORDER BY u.ord) AS columns,
             fcl.relname AS foreign_table,
             string_agg(fatt.attname, ',' ORDER BY u.ord) AS foreign_columns,
             CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS delete_rule,
             CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS update_rule
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_class fcl ON fcl.oid = c.confrelid
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY u(attnum, ord) ON true
      JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = u.attnum
      JOIN LATERAL unnest(c.confkey) WITH ORDINALITY fu(attnum, ord) ON fu.ord = u.ord
      JOIN pg_attribute fatt ON fatt.attrelid = c.confrelid AND fatt.attnum = fu.attnum
      WHERE c.contype = 'f' AND n.nspname = 'public'
      GROUP BY c.oid, c.conname, cl.relname, fcl.relname, c.confdeltype, c.confupdtype
      ORDER BY cl.relname, c.conname
    `).rows;
    if (fks.length > 0) {
      sqlScript += `-- ==== FOREIGN KEYS ====\n`;
      for (const fk of fks) {
        sqlScript += `ALTER TABLE public.${fk.table_name} ADD CONSTRAINT ${fk.conname} FOREIGN KEY (${fk.columns}) REFERENCES public.${fk.foreign_table}(${fk.foreign_columns}) ON DELETE ${fk.delete_rule} ON UPDATE ${fk.update_rule};\n`;
      }
      sqlScript += '\n';
    }

    // ÃNDICES (no PK/UNIQUE)
    const indexes = (await client.queryObject<{ indexdef: string }>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT IN (
          SELECT conname FROM pg_constraint
          WHERE contype IN ('p','u') AND connamespace = 'public'::regnamespace
        )
      ORDER BY tablename, indexname
    `).rows;
    if (indexes.length > 0) {
      sqlScript += `-- ==== ÃNDICES ====\n`;
      for (const i of indexes) sqlScript += `${i.indexdef};\n`;
      sqlScript += '\n';
    }

    // FUNCIONES
    const functions = (await client.queryObject<{ definition: string }>`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.prokind = 'f'
      ORDER BY p.proname
    `).rows;
    if (functions.length > 0) {
      sqlScript += `-- ==== FUNCIONES ====\n`;
      for (const f of functions) sqlScript += `${f.definition};\n\n`;
    }

    // TRIGGERS
    const triggers = (await client.queryObject<{ definition: string }>`
      SELECT pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname
    `).rows;
    if (triggers.length > 0) {
      sqlScript += `-- ==== TRIGGERS ====\n`;
      for (const t of triggers) sqlScript += `${t.definition};\n`;
      sqlScript += '\n';
    }

    // RLS
    sqlScript += `-- ==== ROW LEVEL SECURITY ====\n`;
    for (const t of tables) {
      sqlScript += `ALTER TABLE public.${t.table_name} ENABLE ROW LEVEL SECURITY;\n`;
    }
    sqlScript += '\n';

    // POLÃTICAS
    const policies = (await client.queryObject<{
      tablename: string; policyname: string; permissive: string;
      roles: string[]; cmd: string; qual: string | null; with_check: string | null;
    }>`
      SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `).rows;
    if (policies.length > 0) {
      sqlScript += `-- ==== POLÃTICAS RLS ====\n`;
      for (const p of policies) {
        const cmd = p.cmd === '*' ? 'ALL' : p.cmd;
        sqlScript += `CREATE POLICY "${p.policyname}" ON public.${p.tablename} AS ${p.permissive} FOR ${cmd} TO ${p.roles.join(', ')}`;
        if (p.qual) sqlScript += ` USING (${p.qual})`;
        if (p.with_check) sqlScript += ` WITH CHECK (${p.with_check})`;
        sqlScript += ';\n';
      }
      sqlScript += '\n';
    }

    // ==== DATOS de TODAS las tablas (paginaciÃ³n 1000) ====
    sqlScript += `-- ==== DATOS DE LAS TABLAS ====\n`;
    let totalRows = 0;
    const tableRowCounts: Record<string, number> = {};

    for (const t of tables) {
      const tableName = t.table_name;
      const cols = tableColumns[tableName];
      if (!cols || cols.length === 0) continue;

      try {
        // Total count
        const countRes = await client.queryObject<{ c: bigint }>(
          `SELECT count(*)::bigint AS c FROM public."${tableName}"`
        );
        const total = Number(countRes.rows[0]?.c ?? 0);
        if (total === 0) continue;

        tableRowCounts[tableName] = total;
        totalRows += total;
        sqlScript += `\n-- ${tableName}: ${total} registros\n`;

        const colList = cols.map(c => `"${c.name}"`).join(', ');
        const pageSize = 1000;

        for (let offset = 0; offset < total; offset += pageSize) {
          const res = await client.queryObject<Record<string, unknown>>(
            `SELECT ${colList} FROM public."${tableName}" OFFSET ${offset} LIMIT ${pageSize}`
          );
          for (const row of res.rows) {
            const values = cols.map(c => formatValue(row[c.name], c.udt));
            sqlScript += `INSERT INTO public.${tableName} (${cols.map(c => c.name).join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;\n`;
          }
        }
      } catch (err) {
        console.error(`Error exportando ${tableName}:`, err);
        sqlScript += `-- Error exportando ${tableName}: ${err instanceof Error ? err.message : String(err)}\n`;
      }
    }

    // Resetear secuencias al mÃ¡ximo valor existente
    if (sequences.length > 0) {
      sqlScript += `\n-- ==== RESET SECUENCIAS ====\n`;
      for (const s of sequences) {
        sqlScript += `SELECT setval('public.${s.sequence_name}', COALESCE((SELECT last_value FROM public.${s.sequence_name}), 1), true);\n`;
      }
    }

    sqlScript += `\nSET session_replication_role = 'origin';\n`;
    sqlScript += `\n-- Tablas:${tables.length} Funciones:${functions.length} Triggers:${triggers.length} PolÃ­ticas:${policies.length} Filas:${totalRows}\n`;

    await client.end();

    return new Response(JSON.stringify({
      success: true,
      script: sqlScript,
      stats: {
        tables: tables.length,
        functions: functions.length,
        triggers: triggers.length,
        policies: policies.length,
        totalRows,
        tableRowCounts,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error backup completo:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
