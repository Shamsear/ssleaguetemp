const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const bid = await sql`SELECT * FROM bids WHERE player_id = '2873' OR player_id = '151538'`;
    console.log("Filippo Distefano bids:", bid);
  } catch (err) {
    console.error(err);
  }
}
check();
