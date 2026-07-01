const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envPath = path.join(__dirname, '../.env.local');
let dbUrl = '';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  const tournamentLine = lines.find(l => l.startsWith('NEON_TOURNAMENT_DB_URL='));
  if (tournamentLine) {
    dbUrl = tournamentLine.split('NEON_TOURNAMENT_DB_URL=')[1].trim();
    if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) dbUrl = dbUrl.substring(1, dbUrl.length - 1);
  }
}

async function run() {
  const sql = neon(dbUrl);
  const futureSeasonTournament = await sql`
    SELECT id, player_name, season_id FROM player_seasons
    WHERE season_id IS NOT NULL AND season_id != ''
      AND CAST(REGEXP_REPLACE(season_id, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log(`Verification: Remaining player_seasons rows belonging to S18+: ${futureSeasonTournament.length}`);
}

run().catch(console.error);
