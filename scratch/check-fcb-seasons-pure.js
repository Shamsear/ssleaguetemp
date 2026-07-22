require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
if (!connectionString) {
  console.error('NEON_TOURNAMENT_DB_URL is not set.');
  process.exit(1);
}

const sql = neon(connectionString);

async function checkNeon() {
  const teamId = 'SSPSLT0006';
  console.log(`=== Checking PostgreSQL (Neon) for Team ${teamId} ===\n`);

  try {
    const rows = await sql`
      SELECT season_id, team_name 
      FROM teamstats 
      WHERE team_id = ${teamId}
      ORDER BY season_id
    `;
    console.log('--- PostgreSQL teamstats records ---');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Error querying Neon:', err);
  }
  process.exit(0);
}

checkNeon();
