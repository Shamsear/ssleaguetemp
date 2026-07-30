const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const zeros = await sql`
      SELECT id, player_name, player_id, team_name, season_id, acquisition_type, acquisition_value 
      FROM player_history 
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17') AND (acquisition_value = 0 OR acquisition_value IS NULL)
    `;
    console.log(`Found ${zeros.length} records with 0/null acquisition value:`);
    console.log(JSON.stringify(zeros, null, 2));
  } catch (err) {
    console.error(err);
  }
}
check();
