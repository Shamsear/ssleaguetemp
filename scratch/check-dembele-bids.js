const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const bids = await sql`SELECT * FROM bids WHERE player_id = '2985'`;
    console.log("Bids for Dembele:", bids);
    const rp = await sql`SELECT * FROM round_players WHERE player_id = '2985'`;
    console.log("Round players for Dembele:", rp);
  } catch (err) {
    console.error(err);
  }
}
check();
