const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

const env = fs.readFileSync('.env.local', 'utf-8');
const lines = env.split('\n');
const getVal = (k) => {
  const line = lines.find(l => l.trim().startsWith(k + '='));
  if (!line) return null;
  const val = line.split('=')[1].trim();
  return val.replace(/^["']|["']$/g, '');
};

const sql = neon(getVal('NEON_MAIN_DB_URL'));

async function main() {
  const ts = await sql`SELECT * FROM team_seasons WHERE season_id = 'SSPSLS19' LIMIT 10`;
  console.log(`team_seasons for SSPSLS19 (${ts.length} found):`, ts);
}

main().catch(console.error);
