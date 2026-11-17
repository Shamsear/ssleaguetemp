import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * GET /api/fantasy/draft/post-release-bids?league_id=xxx&window_id=yyy&category=zzz
 * Fetch submitted post-release bids for a transfer window category round
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth([], request);
    const isCommittee = auth.authenticated && (auth.role === 'admin' || auth.role === 'committee_admin' || auth.role === 'super_admin');

    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const windowId = searchParams.get('window_id');
    const category = searchParams.get('category');
    const teamId = searchParams.get('team_id');

    if (!leagueId || !windowId) {
      return NextResponse.json(
        { error: 'league_id and window_id are required' },
        { status: 400 }
      );
    }

    if (!isCommittee && !teamId) {
      return NextResponse.json(
        { error: 'team_id is required' },
        { status: 400 }
      );
    }

    // Query bids from fantasy_post_release_bids joined with fantasy_teams
    // If not committee or teamId provided, restrict bids to that team or finalized 'won' bids
    let bids = [];
    if (category) {
      if (teamId) {
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
            AND (b.team_id = ${teamId} OR b.status = 'won')
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
            AND (b.category ILIKE ${category} OR (${category === 'Passive Team'} AND b.is_passive_team = true))
          ORDER BY b.target_id, b.bid_amount DESC, b.submitted_at ASC
        `;
      }
    } else {
      if (teamId) {
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
            AND (b.team_id = ${teamId} OR b.status = 'won')
          ORDER BY b.submitted_at DESC
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

/**
 * DELETE /api/fantasy/draft/post-release-bids?window_id=xxx&team_id=yyy&category=zzz
 * Unlock / delete submitted post-release bids for a team and category slot
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const windowId = searchParams.get('window_id');
    const teamId = searchParams.get('team_id');
    const category = searchParams.get('category');

    if (!windowId || !teamId) {
      return NextResponse.json(
        { error: 'window_id and team_id are required' },
        { status: 400 }
      );
    }

    if (category) {
      await fantasySql`
        DELETE FROM fantasy_post_release_bids
        WHERE team_id = ${teamId}
          AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
          AND (category ILIKE ${category} OR (${category === 'Passive Team'} AND is_passive_team = true))
      `;
    } else {
      await fantasySql`
        DELETE FROM fantasy_post_release_bids
        WHERE team_id = ${teamId}
          AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Post-release bids deleted/unlocked successfully'
    });
  } catch (error: any) {
    console.error('Error deleting post-release bids:', error);
    return NextResponse.json(
      { error: 'Failed to delete post-release bids', details: error.message },
      { status: 500 }
    );
  }
}

