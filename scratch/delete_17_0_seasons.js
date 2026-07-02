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
  
  console.log("=== EXECUTING DELETION OF 'SSPSLS17.0' RECORDS ===");
  
  // First, verify how many rows exist
  const countBefore = await sql`
    SELECT COUNT(*) FROM player_seasons WHERE season_id = 'SSPSLS17.0'
  `;
  const totalBefore = parseInt(countBefore[0].count);
  console.log(`Found ${totalBefore} rows to delete.`);

  if (totalBefore > 0) {
    // Delete the rows
    const deleteResult = await sql`
      DELETE FROM player_seasons 
      WHERE season_id = 'SSPSLS17.0'
      RETURNING id, player_name
    `;
    console.log(`Successfully deleted ${deleteResult.length} rows with season_id = 'SSPSLS17.0'!`);
    console.log("Deleted players list:", deleteResult.map(r => r.player_name));
  } else {
    console.log("No rows found to delete.");
  }
  
  // Verify remaining count
  const countAfter = await sql`
    SELECT COUNT(*) FROM player_seasons WHERE season_id = 'SSPSLS17.0'
  `;
  console.log(`Verification: Remaining 'SSPSLS17.0' rows: ${countAfter[0].count}`);
}

run().catch(console.error);
