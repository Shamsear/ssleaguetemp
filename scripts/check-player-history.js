const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.DATABASE_URL);

async function checkPlayerHistory() {
  const playerId = process.argv[2] || '162163';
  
  const results = await sql`
    SELECT * 
    FROM player_history 
    WHERE player_id = ${playerId}
    ORDER BY acquisition_date DESC 
    LIMIT 5
  `;
  
  console.log(`\nPlayer History for ${playerId}:\n`);
  console.log(JSON.stringify(results, null, 2));
}

checkPlayerHistory().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
