const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      let key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[key] = val;
    }
  }
});

async function checkPlayer24() {
  const sql = neon(envVars.NEON_MAIN_DB_URL);
  const rows = await sql`SELECT * FROM realplayers WHERE id LIKE '%0024%'`;
  console.log('Player 0024 in MAIN_DB realplayers:', rows);

  const tSql = neon(envVars.NEON_TOURNAMENT_DB_URL);
  const tRows = await tSql`SELECT * FROM realplayerstats WHERE player_id LIKE '%0024%' LIMIT 3`;
  console.log('Player 0024 in TOURNAMENT_DB realplayerstats:', tRows);
}

checkPlayer24().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
