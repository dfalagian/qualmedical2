/**
 * Imports qualmedical_data_inserts.sql into Supabase one statement at a time.
 * Usage: node import_data.js <db-password>
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node import_data.js <db-password>');
  process.exit(1);
}

const DB_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.flhukvtzjykadaanjqjm.supabase.co:5432/postgres`;
const SQL_FILE = path.join(__dirname, 'supabase', 'migrations', 'qualmedical_data_inserts.sql');

async function run() {
  console.log('Reading SQL file...');
  const raw = fs.readFileSync(SQL_FILE, 'utf8');

  // Split into individual statements on semicolons, keeping meaningful ones
  const lines = raw.split('\n');
  const statements = [];
  let current = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines for splitting purposes, but keep for statements
    if (trimmed === '' || trimmed.startsWith('--')) continue;

    // Skip the outer BEGIN/COMMIT/SET wrappers — we'll manage transactions ourselves
    if (
      trimmed.toUpperCase().startsWith('BEGIN') ||
      trimmed.toUpperCase().startsWith('COMMIT') ||
      trimmed.toUpperCase().startsWith('SET SESSION_REPLICATION_ROLE')
    ) continue;

    current.push(line);
    if (trimmed.endsWith(';')) {
      const stmt = current.join('\n').trim();
      if (stmt.length > 1) statements.push(stmt);
      current = [];
    }
  }

  console.log(`Total statements to execute: ${statements.length}`);

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to database.');

  // Disable FK checks for the import
  await client.query("SET session_replication_role = 'replica'");

  const BATCH = 100;
  let success = 0;
  let errors = 0;

  for (let i = 0; i < statements.length; i += BATCH) {
    const batch = statements.slice(i, i + BATCH);
    try {
      await client.query('BEGIN');
      for (const stmt of batch) {
        await client.query(stmt);
      }
      await client.query('COMMIT');
      success += batch.length;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`\nBatch ${Math.floor(i / BATCH) + 1} failed, retrying one by one...`);
      // Retry one by one to isolate the bad statement
      for (const stmt of batch) {
        try {
          await client.query(stmt);
          success++;
        } catch (e2) {
          errors++;
          console.error(`  SKIP [${errors}]: ${stmt.slice(0, 120).replace(/\n/g, ' ')} — ${e2.message}`);
        }
      }
    }

    const done = Math.min(i + BATCH, statements.length);
    process.stdout.write(`\rProgress: ${done}/${statements.length} (${errors} errors)`);
  }

  await client.query("SET session_replication_role = 'origin'");
  await client.end();

  console.log(`\n\nDone! Inserted: ${success}, Skipped: ${errors}`);
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
