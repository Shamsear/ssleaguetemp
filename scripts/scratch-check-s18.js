require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function main() {
  const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
  const sql = neon(connectionString);
  const season_id = 'SSPSLS18';
  
  try {
    const results = await sql`
      SELECT category, COUNT(*) as count
      FROM realplayerstats
      WHERE season_id = ${season_id}
      GROUP BY category
    `;
    console.log('Category distribution for season 18:');
    console.log(results);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
