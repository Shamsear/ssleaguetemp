import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { allTeamsSubmitted } from '@/lib/tiebreaker';
import { broadcastTiebreakerBid } from '@/lib/realtime/broadcast';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * POST /api/admin/tiebreakers/[id]/submit
 * Admin/committee endpoint to enter or update a team's tiebreaker bid (or revert it).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(['admin', 'committee_admin', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: tiebreakerId } = await params;
    const body = await request.json();
    const { teamId, newBidAmount, action } = body;

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'teamId is required' },
        { status: 400 }
      );
    }

    // Fetch tiebreaker
    const tiebreakerResult = await sql`
      SELECT t.*, r.season_id
      FROM tiebreakers t
      INNER JOIN rounds r ON t.round_id = r.id
      WHERE t.id = ${tiebreakerId}
    `;

    if (tiebreakerResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tiebreaker not found' },
        { status: 404 }
      );
    }

    const tiebreaker = tiebreakerResult[0];

    if (tiebreaker.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `Cannot modify a tiebreaker that is ${tiebreaker.status}` },
        { status: 400 }
      );
    }

    // Find team_tiebreakers entry
    const teamTiebreakerResult = await sql`
      SELECT tt.*, b.team_id
      FROM team_tiebreakers tt
      INNER JOIN bids b ON b.id::text = tt.original_bid_id
      WHERE tt.tiebreaker_id = ${tiebreakerId}
      AND b.team_id = ${teamId}
    `;

    if (teamTiebreakerResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Team is not part of this tiebreaker' },
        { status: 404 }
      );
    }

    const teamTiebreaker = teamTiebreakerResult[0];

    // Handle revert action
    if (action === 'revert') {
      const revertResult = await sql`
        UPDATE team_tiebreakers
        SET 
          new_bid_amount = NULL,
          submitted = false,
          status = 'pending',
          submitted_at = NULL
        WHERE id = ${teamTiebreaker.id}
        RETURNING *
      `;

      return NextResponse.json({
        success: true,
        message: 'Tiebreaker bid reverted to pending',
        data: revertResult[0],
      });
    }

    // Otherwise, submit/update bid
    const amount = Number(newBidAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid bid amount is required' },
        { status: 400 }
      );
    }

    // Validate that new bid is at least equal to original tied bid
    if (amount < tiebreaker.original_amount) {
      return NextResponse.json(
        {
          success: false,
          error: `New bid must be at least £${tiebreaker.original_amount.toLocaleString()} (the tied bid amount)`,
        },
        { status: 400 }
      );
    }

    // Check team balance in Neon teams table
    const teamRow = await sql`
      SELECT id, name, football_budget, football_spent
      FROM teams
      WHERE id = ${teamId}
      LIMIT 1
    `;

    if (teamRow.length > 0) {
      const availableBalance = Number(teamRow[0].football_budget || 0);
      if (amount > availableBalance) {
        return NextResponse.json(
          {
            success: false,
            error: `Insufficient budget for ${teamRow[0].name}. Available: £${availableBalance.toLocaleString()}`,
          },
          { status: 400 }
        );
      }
    }

    // Update team_tiebreaker
    const updateResult = await sql`
      UPDATE team_tiebreakers
      SET 
        new_bid_amount = ${amount},
        submitted = true,
        status = 'submitted',
        submitted_at = NOW()
      WHERE id = ${teamTiebreaker.id}
      RETURNING *
    `;

    const teamName = teamRow[0]?.name || updateResult[0].team_name || teamId;

    // Broadcast real-time update
    try {
      await broadcastTiebreakerBid(tiebreaker.season_id || 'default', tiebreakerId, {
        team_id: teamId,
        team_name: teamName,
        bid_amount: amount,
      });
    } catch (bcastErr) {
      console.warn('Realtime broadcast failed:', bcastErr);
    }

    // Check if all teams have now submitted
    const allSubmitted = await allTeamsSubmitted(tiebreakerId);

    return NextResponse.json({
      success: true,
      message: `Successfully entered bid of £${amount.toLocaleString()} for ${teamName}`,
      allSubmitted,
      data: updateResult[0],
    });
  } catch (error: any) {
    console.error('Error submitting tiebreaker bid as admin:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
