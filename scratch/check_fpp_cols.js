const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
env.split('\n').forEach(l => {
  const idx = l.indexOf('=');
  if (idx !== -1) envVars[l.substring(0, idx).trim()] = l.substring(idx+1).trim().replace(/^["']|["']$/g, '');
});

async function checkCols() {
  const sql = neon(envVars.FANTASY_DATABASE_URL);
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'fantasy_player_points'`;
  console.log('Columns of fantasy_player_points:', cols.map(c => c.column_name));
  const sample = await sql`SELECT * FROM fantasy_player_points WHERE player_name ILIKE '%adhil%' LIMIT 1`;
  console.log('Sample row:', sample);
}

checkCols().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
