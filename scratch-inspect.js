const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);
  
  try {
    console.log('--- Sample star ratings for S16 and S17 ---');
    const stars = await sql`
      SELECT player_id, season_id, player_name, star_rating, points, base_points 
      FROM player_seasons 
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      LIMIT 10
    `;
    console.table(stars);

  } catch (err) {
    console.error(err);
  }
}

main();
