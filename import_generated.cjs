/**
 * Re-imports rows that failed due to GENERATED columns.
 * Strips the generated column + its value before inserting.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = `postgresql://postgres:${encodeURIComponent('Bolso48433cxj@')}@db.flhukvtzjykadaanjqjm.supabase.co:5432/postgres`;
const SQL_FILE = path.join(__dirname, 'supabase', 'migrations', 'qualmedical_data_inserts.sql');

// Map of table -> columns to drop (GENERATED columns)
const GENERATED_COLS = {
  physical_inventory_counts: ['difference'],
  product_price_history: ['price_change_percentage'],
};

/**
 * Parse a VALUES(...) string into an array of raw tokens.
 * Handles quoted strings with escaped quotes and commas inside strings.
 */
function parseValues(valuesStr) {
  // valuesStr is like: 'abc','def',NULL,'x,y',42
  const tokens = [];
  let i = 0;
  while (i < valuesStr.length) {
    if (valuesStr[i] === "'") {
      // Quoted string
      let j = i + 1;
      let str = "'";
      while (j < valuesStr.length) {
        if (valuesStr[j] === "'" && valuesStr[j + 1] === "'") {
          str += "''";
          j += 2;
        } else if (valuesStr[j] === "'") {
          str += "'";
          j++;
          break;
        } else {
          str += valuesStr[j];
          j++;
        }
      }
      tokens.push(str);
      i = j;
      if (valuesStr[i] === ',') i++;
    } else {
      // Unquoted token (NULL, number, etc.)
      let j = i;
      while (j < valuesStr.length && valuesStr[j] !== ',') j++;
      tokens.push(valuesStr.slice(i, j));
      i = j;
      if (valuesStr[i] === ',') i++;
    }
  }
  return tokens;
}

/**
 * Given an INSERT statement for a table with GENERATED columns,
 * return a rewritten INSERT that omits those columns + their values.
 */
function rewriteInsert(stmt, tableName, dropCols) {
  // Match: INSERT INTO public."table" (cols) VALUES (vals);
  const m = stmt.match(/^INSERT INTO public\."[^"]+"\s+\(([^)]+)\)\s+VALUES\s+\((.+)\);?$/s);
  if (!m) return null;

  const cols = m[1].split(',').map(c => c.trim());
  const valStr = m[2];
  const vals = parseValues(valStr);

  if (cols.length !== vals.length) {
    // Mismatch — skip
    return null;
  }

  // Drop GENERATED columns
  const keep = cols.map((c, i) => ({ col: c, val: vals[i] }))
    .filter(({ col }) => !dropCols.includes(col));

  const newCols = keep.map(x => x.col).join(',');
  const newVals = keep.map(x => x.val).join(',');

  return `INSERT INTO public."${tableName}" (${newCols}) VALUES (${newVals})`;
}

async function run() {
  console.log('Reading SQL file...');
  const raw = fs.readFileSync(SQL_FILE, 'utf8');
  const lines = raw.split('\n');

  // Collect only the INSERT statements for the affected tables
  const targetTables = Object.keys(GENERATED_COLS);
  const stmts = [];

  let current = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('--') ||
        t.toUpperCase().startsWith('BEGIN') ||
        t.toUpperCase().startsWith('COMMIT') ||
        t.toUpperCase().startsWith('SET SESSION_REPLICATION_ROLE')) continue;

    current.push(line);
    if (t.endsWith(';')) {
      const stmt = current.join('\n').trim();
      current = [];
      const tableMatch = stmt.match(/INSERT INTO public\."([^"]+)"/);
      if (tableMatch && targetTables.includes(tableMatch[1])) {
        stmts.push({ stmt, table: tableMatch[1] });
      }
    }
  }

  console.log(`Statements to re-import: ${stmts.length}`);

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  await client.query("SET session_replication_role = 'replica'");

  let success = 0, errors = 0;

  for (let i = 0; i < stmts.length; i++) {
    const { stmt, table } = stmts[i];
    const rewritten = rewriteInsert(stmt, table, GENERATED_COLS[table]);
    if (!rewritten) {
      errors++;
      console.error(`Could not rewrite stmt ${i + 1}`);
      continue;
    }
    try {
      await client.query(rewritten);
      success++;
    } catch (e) {
      errors++;
      console.error(`SKIP [${errors}]: ${rewritten.slice(0, 100)} — ${e.message}`);
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`\rProgress: ${i + 1}/${stmts.length}`);
  }

  await client.query("SET session_replication_role = 'origin'");
  await client.end();

  console.log(`\nDone! Inserted: ${success}, Failed: ${errors}`);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
