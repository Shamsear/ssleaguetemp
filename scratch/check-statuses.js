const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const counts = await sql`SELECT status, COUNT(*) FROM player_history WHERE season_id IN ('SSPSLS16', 'SSPSLS17') GROUP BY status`;
    console.log("Status counts:", counts);
  } catch (err) {
    console.error(err);
  }
}
check();
