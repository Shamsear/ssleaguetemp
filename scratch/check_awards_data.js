const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
const sql = neon(connectionString);

async function check() {
  try {
    console.log('--- Tournaments ---');
    const tournaments = await sql`
      SELECT id, tournament_name, season_id, is_primary FROM tournaments
    `;
    console.log(tournaments);

    console.log('\n--- Fixtures ---');
    const fixtureCounts = await sql`
      SELECT tournament_id, status, COUNT(*) as count 
      FROM fixtures 
      GROUP BY tournament_id, status
    `;
    console.log('Fixture counts:', fixtureCounts);

    console.log('\n--- Team Stats ---');
    const teamStatsCounts = await sql`
      SELECT season_id, COUNT(*) as count 
      FROM teamstats 
      GROUP BY season_id
    `;
    console.log('Teamstats counts:', teamStatsCounts);

    if (tournaments.length > 0) {
      const primaryTour = tournaments[0].id;
      console.log(`\nSample completed fixtures for tournament ${primaryTour}:`);
      const fixtures = await sql`
        SELECT id, home_team_name, away_team_name, home_score, away_score, status, result 
        FROM fixtures 
        WHERE tournament_id = ${primaryTour} AND status = 'completed' 
        LIMIT 5
      `;
      console.log(fixtures);
    }
  } catch (err) {
    console.error(err);
  }
}
check();
