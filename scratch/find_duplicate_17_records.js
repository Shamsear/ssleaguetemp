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
  
  // Find all rows with season_id = 'SSPSLS17.0'
  const dotZeroRows = await sql`
    SELECT player_id, player_name, team, season_id, contract_id, contract_start_season, contract_end_season, registration_status
    FROM player_seasons
    WHERE season_id = 'SSPSLS17.0'
    ORDER BY player_name ASC
  `;

  const duplicates = [];

  for (const r0 of dotZeroRows) {
    // Check if the same player has a 'SSPSLS17' record
    const r17 = await sql`
      SELECT id, player_name, team, season_id, contract_id, contract_start_season, contract_end_season, registration_status
      FROM player_seasons
      WHERE player_id = ${r0.player_id} AND season_id = 'SSPSLS17'
      LIMIT 1
    `;

    if (r17.length > 0) {
      duplicates.push({
        player_id: r0.player_id,
        player_name: r0.player_name,
        s17_team: r17[0].team || 'None (Released/Unassigned)',
        s17_reg_status: r17[0].registration_status,
        s17_contract_end: r17[0].contract_end_season,
        s17_0_reg_status: r0.registration_status,
        s17_0_contract_end: r0.contract_end_season
      });
    }
  }

  // Write the list to a JSON file for anti-truncation safety
  fs.writeFileSync(path.join(__dirname, 'duplicate_17_records.json'), JSON.stringify(duplicates, null, 2));

  console.log(`JSON_OUTPUT_START`);
  console.log(JSON.stringify(duplicates));
  console.log(`JSON_OUTPUT_END`);
}

run().catch(console.error);
