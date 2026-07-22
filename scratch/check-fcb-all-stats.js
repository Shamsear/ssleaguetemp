require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
if (!connectionString) {
  console.error('NEON_TOURNAMENT_DB_URL is not set.');
  process.exit(1);
}

const sql = neon(connectionString);

async function checkAllBarcelona() {
  console.log(`=== Querying all teamstats records for 'FC Barcelona' or similar ===\n`);

  try {
    const rows = await sql`
      SELECT season_id, team_id, team_name 
      FROM teamstats 
      WHERE LOWER(team_name) LIKE '%barcelona%'
      ORDER BY season_id, team_id
    `;
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Error querying Neon:', err);
  }
  process.exit(0);
}

checkAllBarcelona();
