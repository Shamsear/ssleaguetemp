const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function run() {
  try {
    const roundId = 'SSPSLFR00039';
    
    // Check all tiebreakers for round 19
    const tiebreakers = await sql`
      SELECT * FROM tiebreakers WHERE round_id = ${roundId}
    `;
    console.log(`Tiebreakers for round 19 (${tiebreakers.length}):`);
    console.log(tiebreakers);

  } catch (error) {
    console.error(error);
  }
}
run();
