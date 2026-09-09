import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/post-release-bids?league_id=xxx&window_id=yyy&category=zzz
 * Fetch submitted post-release bids for a transfer window category round
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const windowId = searchParams.get('window_id');
    const category = searchParams.get('category');

    if (!leagueId || !windowId) {
      return NextResponse.json(
        { error: 'league_id and window_id are required' },
        { status: 400 }
      );
    }

    // Query bids from fantasy_post_release_bids joined with fantasy_teams
    let bids = [];
    if (category) {
      bids = await fantasySql`
        SELECT 
          b.bid_id, b.draft_round_id, b.league_id, b.team_id,
          b.category, b.is_passive_team, b.target_id, b.target_name,
          b.bid_amount, b.status, b.submitted_at,
          t.team_name, t.owner_name, t.budget_remaining
        FROM fantasy_post_release_bids b
        JOIN fantasy_teams t ON b.team_id = t.team_id
        WHERE b.league_id = ${leagueId}
          AND (b.draft_round_id = ${windowId} OR b.bid_id LIKE ${'%' + windowId + '%'})
          AND (b.category ILIKE ${category} OR (${category === 'Passive Team'} AND b.is_passive_team = true))
        ORDER BY b.target_id, b.bid_amount DESC, b.submitted_at ASC
      `;
    } else {
      bids = await fantasySql`
        SELECT 
          b.bid_id, b.draft_round_id, b.league_id, b.team_id,
          b.category, b.is_passive_team, b.target_id, b.target_name,
          b.bid_amount, b.status, b.submitted_at,
          t.team_name, t.owner_name, t.budget_remaining
        FROM fantasy_post_release_bids b
        JOIN fantasy_teams t ON b.team_id = t.team_id
        WHERE b.league_id = ${leagueId}
          AND (b.draft_round_id = ${windowId} OR b.bid_id LIKE ${'%' + windowId + '%'})
        ORDER BY b.submitted_at DESC
      `;
    }

    // Also fetch ties for this window
    const ties = await fantasySql`
      SELECT 
        t.tie_id, t.draft_round_id, t.league_id, t.target_id, t.target_name,
        t.category, t.is_passive_team, t.tied_team_ids, t.tied_bid_amount,
        t.status, t.winning_team_id, t.admin_adjusted_amount, t.created_at
      FROM fantasy_draft_ties t
      WHERE t.league_id = ${leagueId}
        AND (t.draft_round_id = ${windowId} OR t.tie_id LIKE ${'%' + windowId + '%'})
    `;

    return NextResponse.json({
      success: true,
      league_id: leagueId,
      window_id: windowId,
      category: category || null,
      bids,
      ties
    });

  } catch (error: any) {
    console.error('Error fetching post-release bids:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post-release bids', details: error.message },
      { status: 500 }
    );
  }
}
