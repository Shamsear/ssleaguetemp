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
  
  const players = ['sspslpsl0028', 'sspslpsl0034', 'sspslpsl0024'];
  
  for (const pid of players) {
    const rows = await sql`
      SELECT id, player_name, team, season_id, contract_id, contract_start_season, contract_end_season, contract_length, registration_status, status
      FROM player_seasons
      WHERE player_id = ${pid}
      ORDER BY season_id ASC
    `;
    console.log(`\n=== Player: ${pid} ===`);
    console.table(rows);
  }
}

run().catch(console.error);
