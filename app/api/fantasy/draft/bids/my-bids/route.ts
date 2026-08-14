import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/bids/my-bids?user_id=xxx
 * Retrieve the current team's draft bids
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user_id parameter' },
        { status: 400 }
      );
    }

    // 1. Get the fantasy team for this owner
    const teams = await fantasySql`
      SELECT team_id, league_id, budget_remaining, draft_submitted 
      FROM fantasy_teams
      WHERE owner_uid = ${userId} AND is_enabled = true
      LIMIT 1
    `;

    if (teams.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy team not found or not enabled' },
        { status: 404 }
      );
    }

    const { team_id, league_id, budget_remaining, draft_submitted } = teams[0];

    // 2. Fetch all bids submitted by this team
    const bids = await fantasySql`
      SELECT 
        id,
        bid_id,
        slot_index,
        priority,
        target_id,
        bid_type,
        bid_amount,
        status,
        submitted_at
      FROM fantasy_draft_bids
      WHERE team_id = ${team_id} AND league_id = ${league_id}
      ORDER BY slot_index ASC, priority ASC
    `;

    return NextResponse.json({
      success: true,
      team_id,
      league_id,
      budget_remaining: Number(budget_remaining),
      draft_submitted: !!draft_submitted,
      bids: bids.map(b => ({
        id: b.id,
        bid_id: b.bid_id,
        slot_index: b.slot_index,
        priority: b.priority,
        target_id: b.target_id,
        bid_type: b.bid_type,
        bid_amount: Number(b.bid_amount),
        status: b.status,
        submitted_at: b.submitted_at
      }))
    });
  } catch (error) {
    console.error('Error fetching my bids:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bids', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
