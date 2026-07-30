const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function checkBids() {
  const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const sample = await sql`SELECT * FROM round_bids LIMIT 1`;
    console.log("Sample round_bids row:", sample);
  } catch (err) {
    console.error(err);
  }
}
checkBids();
