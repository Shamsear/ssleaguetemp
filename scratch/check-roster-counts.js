const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const auctionSql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  const tourneySql = neon(process.env.NEON_TOURNAMENT_DB_URL);
  try {
    console.log("=== team_players counts in Auction DB ===");
    const aCounts = await auctionSql`SELECT season_id, COUNT(*) FROM team_players GROUP BY season_id`;
    console.log(aCounts);

    console.log("=== team_players counts in Tournament DB ===");
    const tCounts = await tourneySql`SELECT season_id, COUNT(*) FROM team_players GROUP BY season_id`;
    console.log(tCounts);
  } catch (err) {
    console.error(err);
  }
}
check();
