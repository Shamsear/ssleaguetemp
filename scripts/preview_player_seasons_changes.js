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
  
  // 1. Fetch contracts to terminate (ends in S18+)
  const updates = await sql`
    SELECT id, player_name, team, season_id, contract_id, contract_start_season, contract_end_season, contract_length
    FROM player_seasons
    WHERE contract_end_season IS NOT NULL AND contract_end_season != ''
      AND CAST(REGEXP_REPLACE(contract_end_season, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
    ORDER BY player_name ASC
  `;

  // 2. Fetch rows to delete (season_id in S18+)
  const deletions = await sql`
    SELECT id, player_name, team, season_id, contract_id, contract_start_season, contract_end_season
    FROM player_seasons
    WHERE season_id IS NOT NULL AND season_id != ''
      AND CAST(REGEXP_REPLACE(season_id, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
    ORDER BY player_name ASC
  `;

  const output = {
    updatesCount: updates.length,
    updates: updates.map(u => ({
      id: u.id,
      player_name: u.player_name,
      team: u.team,
      season_id: u.season_id,
      current_end: u.contract_end_season,
      new_end: 'SSPSLS17',
      contract_id: u.contract_id
    })),
    deletionsCount: deletions.length,
    deletions: deletions.map(d => ({
      id: d.id,
      player_name: d.player_name,
      team: d.team,
      season_id: d.season_id
    }))
  };

  fs.writeFileSync(path.join(__dirname, 'preview_player_seasons.json'), JSON.stringify(output, null, 2));
  console.log("SUCCESS: Preview saved to scripts/preview_player_seasons.json");
}

run().catch(console.error);
