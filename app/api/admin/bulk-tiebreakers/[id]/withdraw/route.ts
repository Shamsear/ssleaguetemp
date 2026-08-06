import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { finalizeBulkTiebreaker } from '@/lib/finalize-bulk-tiebreaker';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * POST /api/admin/bulk-tiebreakers/:id/withdraw
 * Manually withdraw a team from a bulk tiebreaker
 * Committee admin only
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(['admin', 'committee', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: tiebreakerId } = await params;
    const body = await request.json().catch(() => ({}));
    const { teamId } = body;

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'Team ID is required' },
        { status: 400 }
      );
    }

    // 1. Get tiebreaker details
    const tiebreakerCheck = await sql`
      SELECT status FROM bulk_tiebreakers WHERE id = ${tiebreakerId}
    `;
    if (tiebreakerCheck.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tiebreaker not found' },
        { status: 404 }
      );
    }

    if (tiebreakerCheck[0].status === 'resolved' || tiebreakerCheck[0].status === 'finalized') {
      return NextResponse.json(
        { success: false, error: 'Tiebreaker is already resolved or finalized' },
        { status: 400 }
      );
    }

    // 2. Update team status to withdrawn
    const withdrawTime = new Date();
    await sql`
      UPDATE bulk_tiebreaker_teams
      SET 
        status = 'withdrawn',
        withdrawn_at = ${withdrawTime.toISOString()}
      WHERE tiebreaker_id = ${tiebreakerId}
      AND team_id = ${teamId}
    `;

    // 3. Recalculate remaining teams count
    const activeCountResult = await sql`
      SELECT COUNT(*) as count FROM bulk_tiebreaker_teams
      WHERE tiebreaker_id = ${tiebreakerId} AND status = 'active'
    `;
    const activeCount = parseInt(activeCountResult[0].count);

    // Update bulk_tiebreakers teams_remaining and last activity
    await sql`
      UPDATE bulk_tiebreakers
      SET 
        teams_remaining = ${activeCount},
        last_activity_time = ${withdrawTime.toISOString()},
        updated_at = NOW()
      WHERE id = ${tiebreakerId}
    `;

    console.log(`🚪 Admin manually withdrew team ${teamId} from tiebreaker ${tiebreakerId}. Active remaining: ${activeCount}`);

    let autoFinalized = false;
    let winnerTeamName = '';

    // 4. Auto-finalize if only 1 active team left
    if (activeCount === 1) {
      const lastTeamResult = await sql`
        SELECT team_id, team_name, current_bid FROM bulk_tiebreaker_teams
        WHERE tiebreaker_id = ${tiebreakerId} AND status = 'active'
      `;
      if (lastTeamResult.length > 0) {
        const lastTeam = lastTeamResult[0];
        winnerTeamName = lastTeam.team_name;
        
        await sql`
          UPDATE bulk_tiebreakers
          SET 
            current_highest_team_id = ${lastTeam.team_id},
            current_highest_bid = ${lastTeam.current_bid},
            updated_at = NOW()
          WHERE id = ${tiebreakerId}
        `;
        
        console.log(`🔄 Auto-finalizing tiebreaker ${tiebreakerId} with winner ${lastTeam.team_name}`);
        const finalizeResult = await finalizeBulkTiebreaker(tiebreakerId);
        if (finalizeResult.success) {
          autoFinalized = true;
        } else {
          console.error(`❌ Failed auto-finalizing tiebreaker: ${finalizeResult.error}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      autoFinalized,
      winnerTeamName,
      message: `Team successfully withdrawn.${autoFinalized ? ` Tiebreaker resolved with winner ${winnerTeamName}.` : ''}`
    });

  } catch (error: any) {
    console.error('❌ Error in admin team withdraw endpoint:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to withdraw team' },
      { status: 500 }
    );
  }
}
