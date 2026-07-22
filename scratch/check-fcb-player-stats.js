require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
if (!connectionString) {
  console.error('NEON_TOURNAMENT_DB_URL is not set.');
  process.exit(1);
}

const sql = neon(connectionString);

async function checkPlayerStats() {
  console.log(`=== Querying realplayerstats for SSPSLT0006 and SSPSLT0007 in S8, S9, S10 ===\n`);

  try {
    const stats6 = await sql`
      SELECT season_id, COUNT(*)::int as count 
      FROM realplayerstats 
      WHERE team_id = 'SSPSLT0006' AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
      GROUP BY season_id
      ORDER BY season_id
    `;
    console.log('SSPSLT0006 counts:');
    console.log(stats6);

    const stats7 = await sql`
      SELECT season_id, COUNT(*)::int as count 
      FROM realplayerstats 
      WHERE team_id = 'SSPSLT0007' AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
      GROUP BY season_id
      ORDER BY season_id
    `;
    console.log('\nSSPSLT0007 counts:');
    console.log(stats7);
  } catch (err) {
    console.error('Error querying Neon:', err);
  }
  process.exit(0);
}

checkPlayerStats();
