const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function queryPlayer() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const history = await sql`
      SELECT id, player_id, team_id, season_id, status, acquisition_type, acquisition_value, end_date, end_reason 
      FROM player_history 
      WHERE LOWER(player_id) = LOWER('110626') OR LOWER(player_id) = LOWER('2985')
    `;
    console.log("=== RESULTS ===");
    console.log(JSON.stringify(history, null, 2));
    console.log("===============");
  } catch (err) {
    console.error(err);
  }
}
queryPlayer();
