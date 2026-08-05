const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function checkSubmissions() {
  try {
    const roundId = 'SSPSLFR00036';
    
    // Check round
    const roundRes = await sql`SELECT id, status, season_id FROM rounds WHERE id = ${roundId}`;
    const round = roundRes[0];
    console.log('Round:', round);

    // Check all teams in the season
    const teams = await sql`SELECT id, name FROM teams WHERE season_id = ${round.season_id}`;
    console.log(`Total teams in season ${round.season_id}: ${teams.length}`);
    console.log(teams.map(t => t.name));

    // Check bid_submissions
    const submissions = await sql`
      SELECT team_id, submitted_at, bid_count, is_locked 
      FROM bid_submissions 
      WHERE round_id = ${roundId}
    `;
    console.log(`Submissions for round ${roundId} (${submissions.length}):`);
    console.log(submissions.map(s => s.team_id));

  } catch (error) {
    console.error('Error checking database:', error);
  }
}

checkSubmissions();
