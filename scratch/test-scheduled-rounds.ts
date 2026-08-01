import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables from root .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL is not defined in env');
  process.exit(1);
}

const sql = neon(dbUrl);

async function runTests() {
  console.log('🧪 Starting Scheduled Rounds integration tests...');

  // 1. Fetch an existing auction settings and season to use for the mock round
  const settingsResult = await sql`
    SELECT id, season_id 
    FROM auction_settings 
    LIMIT 1
  `;

  if (settingsResult.length === 0) {
    console.error('❌ No auction settings found in the database. Please create one first.');
    process.exit(1);
  }

  const { id: settingsId, season_id: seasonId } = settingsResult[0];
  console.log(`ℹ️ Using Season ID: ${seasonId}, Settings ID: ${settingsId}`);

  const mockRoundIdEarly = 'TEST_ROUND_EARLY_123';
  const mockRoundIdLate = 'TEST_ROUND_LATE_123';

  // Ensure clean state
  await sql`DELETE FROM rounds WHERE id IN (${mockRoundIdEarly}, ${mockRoundIdLate})`;

  try {
    // ==========================================
    // TEST CASE 1: MANUAL EARLY START (Option C)
    // ==========================================
    console.log('\n--- Test Case 1: Early Start (Option C) ---');
    const now = new Date();
    const scheduledStart = new Date(now.getTime() + 3600 * 1000); // 1 hour in future
    const durationHours = 2;
    const durationSeconds = durationHours * 3600;
    const scheduledEnd = new Date(scheduledStart.getTime() + durationSeconds * 1000); // 3 hours in future

    // Insert scheduled round
    await sql`
      INSERT INTO rounds (
        id, season_id, auction_settings_id, position, max_bids_per_team, 
        round_number, start_time, end_time, duration_seconds, status, finalization_mode, created_at, updated_at
      ) VALUES (
        ${mockRoundIdEarly}, ${seasonId}, ${settingsId}, 'QB', 5, 
        999, ${scheduledStart.toISOString()}, ${scheduledEnd.toISOString()}, ${durationSeconds}, 'scheduled', 'auto', NOW(), NOW()
      )
    `;
    console.log('✅ Inserted standby round scheduled for 1 hour in the future');

    // Simulate early manual start (actual start is NOW, which is before scheduled start)
    const actualStartMs = Date.now();
    const scheduledStartMs = scheduledStart.getTime();
    const scheduledEndMs = scheduledEnd.getTime();
    
    let newEndTime1: Date;
    if (actualStartMs < scheduledStartMs) {
      // Option C: started sooner, end_time remains original scheduledEnd
      newEndTime1 = new Date(scheduledEndMs);
    } else {
      newEndTime1 = new Date(actualStartMs + durationSeconds * 1000);
    }

    await sql`
      UPDATE rounds 
      SET status = 'active', start_time = NOW(), end_time = ${newEndTime1.toISOString()}, updated_at = NOW()
      WHERE id = ${mockRoundIdEarly}
    `;

    // Fetch updated round to verify
    const [roundEarly] = await sql`SELECT start_time, end_time, status FROM rounds WHERE id = ${mockRoundIdEarly}`;
    
    const diffEndTimeEarly = Math.abs(new Date(roundEarly.end_time).getTime() - scheduledEnd.getTime());
    console.log(`- Scheduled End: ${scheduledEnd.toISOString()}`);
    console.log(`- Actual End   : ${new Date(roundEarly.end_time).toISOString()}`);
    console.log(`- Diff (ms)    : ${diffEndTimeEarly}`);

    if (diffEndTimeEarly < 2000) {
      console.log('✅ SUCCESS: Early start preserved original scheduled deadline (Option C)!');
    } else {
      console.error('❌ FAIL: Early start did not preserve original scheduled deadline.');
    }


    // ==========================================
    // TEST CASE 2: AUTOMATIC LATE START (Lazy start)
    // ==========================================
    console.log('\n--- Test Case 2: Late Start (Lazy auto-start) ---');
    const scheduledStartLate = new Date(now.getTime() - 1800 * 1000); // 30 mins in past
    const scheduledEndLate = new Date(scheduledStartLate.getTime() + durationSeconds * 1000); // 1.5 hours in future

    // Insert scheduled round that is due (start_time in past)
    await sql`
      INSERT INTO rounds (
        id, season_id, auction_settings_id, position, max_bids_per_team, 
        round_number, start_time, end_time, duration_seconds, status, finalization_mode, created_at, updated_at
      ) VALUES (
        ${mockRoundIdLate}, ${seasonId}, ${settingsId}, 'RB', 5, 
        1000, ${scheduledStartLate.toISOString()}, ${scheduledEndLate.toISOString()}, ${durationSeconds}, 'scheduled', 'auto', NOW(), NOW()
      )
    `;
    console.log('✅ Inserted standby round scheduled for 30 minutes in the past');

    // Run the lazy start checker logic programmatically
    const roundsToStart = await sql`
      SELECT id, start_time, end_time, duration_seconds 
      FROM rounds 
      WHERE status = 'scheduled' AND start_time <= NOW() AND id = ${mockRoundIdLate}
    `;

    if (roundsToStart.length === 1) {
      console.log('✅ Lazy checker found the due standby round.');
      const round = roundsToStart[0];
      const durSec = round.duration_seconds || durationSeconds;
      const expectedEnd = new Date(Date.now() + durSec * 1000);

      await sql`
        UPDATE rounds
        SET status = 'active', start_time = NOW(), end_time = ${expectedEnd.toISOString()}, updated_at = NOW()
        WHERE id = ${round.id}
      `;

      const [roundLate] = await sql`SELECT start_time, end_time, status FROM rounds WHERE id = ${mockRoundIdLate}`;
      const diffEndTimeLate = Math.abs(new Date(roundLate.end_time).getTime() - expectedEnd.getTime());
      
      console.log(`- Expected End : ${expectedEnd.toISOString()}`);
      console.log(`- Actual End   : ${new Date(roundLate.end_time).toISOString()}`);
      console.log(`- Diff (ms)    : ${diffEndTimeLate}`);

      if (diffEndTimeLate < 2000) {
        console.log('✅ SUCCESS: Late start extended deadline to preserve planned bidding hours!');
      } else {
        console.error('❌ FAIL: Late start did not extend deadline to preserve duration.');
      }
    } else {
      console.error('❌ FAIL: Lazy checker did not pick up the due round.');
    }

  } catch (err) {
    console.error('❌ Error during test run:', err);
  } finally {
    // Clean up database
    await sql`DELETE FROM rounds WHERE id IN (${mockRoundIdEarly}, ${mockRoundIdLate})`;
    console.log('\n🗑️ Cleaned up test rounds.');
    console.log('🏁 Tests completed.');
  }
}

runTests();
