import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import { broadcastRoundUpdate } from '../lib/realtime/broadcast';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

async function run() {
  try {
    const roundId = 'SSPSLFR00039';
    console.log(`Setting status of round ${roundId} to 'completed'...`);

    // 1. Update round status in Postgres
    const result = await sql`
      UPDATE rounds
      SET status = 'completed',
          updated_at = NOW()
      WHERE id = ${roundId}
      RETURNING *
    `;

    console.log('Postgres Update Result:', result[0]);

    // 2. Broadcast via Firebase Realtime DB
    const seasonId = result[0]?.season_id || 'SSPSLS18';
    await broadcastRoundUpdate(seasonId, roundId, {
      status: 'completed',
      type: 'round_finalized'
    });

    console.log('✅ Success! Round status set to completed and broadcasted.');

  } catch (error) {
    console.error('Error completing round:', error);
  }
}
run();
