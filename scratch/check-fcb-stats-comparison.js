require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
if (!connectionString) {
  console.error('NEON_TOURNAMENT_DB_URL is not set.');
  process.exit(1);
}

const sql = neon(connectionString);

async function compareStats() {
  console.log(`=== Comparing S9 teamstats for SSPSLT0006 and SSPSLT0007 ===\n`);

  try {
    const stats = await sql`
      SELECT * FROM teamstats 
      WHERE (team_id = 'SSPSLT0006' OR team_id = 'SSPSLT0007') AND season_id = 'SSPSLS9'
    `;
    console.log(JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error('Error querying Neon:', err);
  }
  process.exit(0);
}

compareStats();
