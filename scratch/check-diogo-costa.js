const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const p = await sql`SELECT * FROM footballplayers WHERE name LIKE '%Diogo Costa%'`;
    console.log("Player:", p);
    if (p.length > 0) {
      const bids = await sql`SELECT * FROM bids WHERE player_id = ${p[0].id.toString()}`;
      console.log("Bids:", bids);
      const rp = await sql`SELECT * FROM round_players WHERE player_id = ${p[0].id.toString()}`;
      console.log("Round players:", rp);
    }
  } catch (err) {
    console.error(err);
  }
}
check();
