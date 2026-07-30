const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const p = await sql`SELECT * FROM footballplayers WHERE name LIKE '%Dembele%' OR name LIKE '%Dembélé%'`;
    console.log("Player Details:", p);
    for (const player of p) {
      const pIdStr = player.id.toString();
      const pCode = player.player_id ? player.player_id.toString().toLowerCase() : '';
      
      const tp = await sql`SELECT tp.*, t.name as team_name FROM team_players tp LEFT JOIN teams t ON tp.team_id = t.id WHERE tp.player_id = ${pIdStr}`;
      console.log(`\nteam_players for ${player.name} (Numeric ID: ${pIdStr}):`, tp);
      
      const ph = await sql`SELECT * FROM player_history WHERE player_id = ${pCode} OR player_id = ${pIdStr} ORDER BY season_id, acquisition_date`;
      console.log(`player_history for ${player.name} (Code: ${pCode}):`, ph);
    }
  } catch (err) {
    console.error(err);
  }
}
check();
