const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const history = await sql`SELECT * FROM player_history WHERE player_id = '162163' OR player_id = '1052'`;
    console.log("Player history in Auction DB:", history);
  } catch (err) {
    console.error(err);
  }
}
check();
