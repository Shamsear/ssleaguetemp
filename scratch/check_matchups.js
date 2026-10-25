const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
env.split('\n').forEach(l => {
  const idx = l.indexOf('=');
  if (idx !== -1) envVars[l.substring(0, idx).trim()] = l.substring(idx+1).trim().replace(/^["']|["']$/g, '');
});

async function check() {
  const sql = neon(envVars.NEON_TOURNAMENT_DB_URL);
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'matchups'`;
  console.log('Columns of matchups:', cols.map(c => c.column_name));
  const row = await sql`SELECT * FROM matchups WHERE row_to_json(matchups)::text ILIKE '%adhil%' LIMIT 1`;
  console.log('Sample matching matchup row:', row);
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
