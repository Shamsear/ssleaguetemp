const { neon } = require('@neondatabase/serverless');
const { finalizeRound, applyFinalizationResults } = require('../lib/finalize-round');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function run() {
  try {
    const roundId = 'SSPSLFR00039';
    console.log(`Starting finalization for round ${roundId}...`);
    
    const finalizationResult = await finalizeRound(roundId);
    console.log('Finalization Result:', finalizationResult);

    if (finalizationResult.success) {
      console.log(`Applying finalization results for ${finalizationResult.allocations.length} allocations...`);
      const applyResult = await applyFinalizationResults(roundId, finalizationResult.allocations);
      console.log('Apply Result:', applyResult);
    } else {
      console.error('Finalization failed:', finalizationResult.error);
    }

    // Check round status now
    const round = await sql`SELECT status, updated_at FROM rounds WHERE id = ${roundId}`;
    console.log('Round status in database:', round[0]);

  } catch (error) {
    console.error('Error during test finalization:', error);
  }
}
run();
