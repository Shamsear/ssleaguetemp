require('dotenv').config({ path: '.env.local' });
const { getTournamentDb } = require('../lib/tournament-db');

async function checkNeon() {
  const teamId = 'SSPSLT0006';
  console.log(`=== Checking PostgreSQL (Neon) for Team ${teamId} ===\n`);

  try {
    const sql = getTournamentDb();
    const rows = await sql`
      SELECT season_id, team_name 
      FROM teamstats 
      WHERE team_id = ${teamId}
      ORDER BY season_id
    `;
    console.log('--- PostgreSQL teamstats records ---');
    console.log(rows);
  } catch (err) {
    console.error('Error querying Neon:', err);
  }
  process.exit(0);
}

checkNeon();
