import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { checkAndFinalizeExpiredRound } from '@/lib/lazy-finalize-round';
import { checkAndStartScheduledRounds } from '@/lib/lazy-start-round';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * GET /api/public/check-rounds
 * Public endpoint to check scheduled rounds to start and active rounds to finalize
 * Called from home page to ensure rounds advance even when no admins are logged in
 */
export async function GET() {
  try {
    // 1. First, check and activate any scheduled rounds whose start time has arrived
    const startedRounds = await checkAndStartScheduledRounds();
    console.log(`⏰ [check-rounds cron] Started ${startedRounds.length} scheduled round(s)`);

    // 2. Fetch all currently active rounds (which now includes any newly activated ones)
    const activeRounds = await sql`
      SELECT id, position, end_time, status
      FROM rounds
      WHERE status = 'active'
    `;

    if (activeRounds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active rounds to check',
        started: startedRounds.length,
        checked: 0,
        finalized: 0
      });
    }

    // 3. Check and finalize each expired round
    const results = await Promise.all(
      activeRounds.map(round => checkAndFinalizeExpiredRound(round.id))
    );

    const finalizedCount = results.filter(r => r.finalized).length;

    return NextResponse.json({
      success: true,
      started: startedRounds.length,
      checked: activeRounds.length,
      finalized: finalizedCount,
      rounds: activeRounds.map((round, index) => ({
        id: round.id,
        position: round.position,
        wasFinalized: results[index].finalized
      }))
    });
  } catch (error: any) {
    console.error('Error checking rounds:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
