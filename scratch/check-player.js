const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function checkPlayer() {
  const auctionSql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  
  try {
    console.log("=== player_history records created/updated around 2025-12-03 ===");
    const rows = await auctionSql`
      SELECT * FROM player_history 
      WHERE (acquisition_date >= '2025-12-03 00:00:00Z'::timestamp AND acquisition_date <= '2025-12-03 23:59:59Z'::timestamp)
         OR (end_date >= '2025-12-03 00:00:00Z'::timestamp AND end_date <= '2025-12-03 23:59:59Z'::timestamp)
    `;
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
  }
}
checkPlayer();
