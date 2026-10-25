const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
env.split('\n').forEach(l => {
  const idx = l.indexOf('=');
  if (idx !== -1) envVars[l.substring(0, idx).trim()] = l.substring(idx+1).trim().replace(/^["']|["']$/g, '');
});

async function checkCasing() {
  const sql = neon(envVars.NEON_MAIN_DB_URL);
  const players = await sql`SELECT name, display_name FROM realplayers LIMIT 10`;
  console.log('MAIN_DB realplayers sample:', players);

  const fSql = neon(envVars.FANTASY_DATABASE_URL);
  const fPlayers = await fSql`SELECT player_name FROM fantasy_players LIMIT 10`;
  console.log('FANTASY_DB fantasy_players sample:', fPlayers);
}
checkCasing().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
