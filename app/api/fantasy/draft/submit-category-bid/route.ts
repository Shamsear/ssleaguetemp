import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * POST /api/fantasy/draft/submit-category-bid
 * Submit a category-restricted draft bid
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth([], request);
    if (!auth.authenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { draft_round_id, league_id, team_id, category, is_passive_team, target_id, target_name, bid_amount } = body;

    if (!draft_round_id || !league_id || !team_id || !category || !target_id || !bid_amount) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 1. Verify team ownership
    const [team] = await fantasySql`
      SELECT team_id, owner_uid, budget
      FROM fantasy_teams
      WHERE team_id = ${team_id}
    `;

    if (!team || team.owner_uid !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden: Not your team' }, { status: 403 });
    }

    const currentBudget = parseFloat(team.budget || 0);
    const amount = parseFloat(bid_amount);

    if (amount > currentBudget) {
      return NextResponse.json(
        { error: `Bid amount (₹${amount}M) exceeds remaining budget (₹${currentBudget}M)` },
        { status: 400 }
      );
    }

    // Save bid
    const bidId = `bid_${draft_round_id}_${team_id}_${target_id}_${Date.now()}`;

    await fantasySql`
      INSERT INTO fantasy_post_release_bids (
        bid_id, draft_round_id, league_id, team_id,
        category, is_passive_team, target_id, target_name,
        bid_amount, status, submitted_at
      ) VALUES (
        ${bidId}, ${draft_round_id}, ${league_id}, ${team_id},
        ${category}, ${is_passive_team || false}, ${target_id}, ${target_name || target_id},
        ${amount}, 'pending', NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'Bid submitted successfully',
      bid_id: bidId
    });

  } catch (error: any) {
    console.error('Error submitting category bid:', error);
    return NextResponse.json(
      { error: 'Failed to submit bid', details: error.message },
      { status: 500 }
    );
  }
}
