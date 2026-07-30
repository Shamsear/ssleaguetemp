const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function queryFields() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    const row = await sql`SELECT * FROM footballplayers WHERE id = '2985'`;
    console.log("=== VIRTUAL PLAYER ROW ===");
    console.log(JSON.stringify(row, null, 2));
  } catch (err) {
    console.error(err);
  }
}
queryFields();
