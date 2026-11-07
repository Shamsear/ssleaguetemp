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
  const sample = await sql`SELECT * FROM team_seasons LIMIT 1`;
  console.log('team_seasons columns:', Object.keys(sample[0]));
  console.log('team_seasons sample row:', sample[0]);
}

main().catch(console.error);
