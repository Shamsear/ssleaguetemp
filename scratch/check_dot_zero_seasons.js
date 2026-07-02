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
  
  // Find all rows in player_seasons with season_id containing '.0'
  const dotZeroRows = await sql`
    SELECT id, player_name, team, season_id, contract_id, contract_start_season, contract_end_season
    FROM player_seasons
    WHERE season_id LIKE '%.0%'
    ORDER BY player_name ASC
  `;

  console.log(`Found ${dotZeroRows.length} rows with '.0' in season_id.`);
  console.log("Details of '.0' rows:");
  console.table(dotZeroRows.slice(0, 20));
}

run().catch(console.error);
