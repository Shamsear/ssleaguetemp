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
  const teams = await sql`SELECT * FROM teams LIMIT 5`;
  console.log('Neon teams columns & sample:');
  console.log(teams.map(t => ({ id: t.id, name: t.name || t.team_name, ...t })));
  
  // Also check if adminDb wrapper uses Neon or what
  const users = await sql`SELECT id, username, team_id, team_name, role FROM users LIMIT 5`;
  console.log('Neon users sample:', users);
}

main().catch(console.error);
