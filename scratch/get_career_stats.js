const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    let key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
});

async function getStats() {
  const sql = neon(envVars.NEON_TOURNAMENT_DB_URL);
  const rows = await sql`
    SELECT player_id, player_name, season_id, team, team_id, category, matches_played, goals_scored, goals_conceded, clean_sheets, wins, draws, losses, points, base_price, price
    FROM realplayerstats
    WHERE player_id IN ('sspslpsl0063', 'sspslpsl0024')
    ORDER BY player_id, season_id
  `;
  console.log(JSON.stringify(rows, null, 2));
}

getStats().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
