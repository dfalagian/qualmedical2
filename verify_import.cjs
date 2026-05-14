const { Client } = require('pg');

const DB_URL = `postgresql://postgres:${encodeURIComponent('Bolso48433cxj@')}@db.flhukvtzjykadaanjqjm.supabase.co:5432/postgres`;

async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const tables = [
    'profiles', 'patients', 'appointments', 'quotes', 'quote_items',
    'products', 'suppliers', 'warehouses', 'inventory_movements',
    'purchase_orders', 'purchase_order_items', 'invoices',
    'physical_inventory_counts', 'product_price_history', 'documents'
  ];

  console.log('Tabla                          | Registros');
  console.log('-------------------------------|----------');

  for (const t of tables) {
    try {
      const r = await client.query(`SELECT COUNT(*) FROM public."${t}"`);
      console.log(`${t.padEnd(30)} | ${r.rows[0].count}`);
    } catch (e) {
      console.log(`${t.padEnd(30)} | ERROR: ${e.message}`);
    }
  }

  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
