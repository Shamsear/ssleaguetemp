import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/admin/fantasy/transfers/submissions?league_id=xxx
 * Get all transfer submissions for the active transfer window, with conflict identification.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized - Committee access required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'league_id is required' },
        { status: 400 }
      );
    }

    // Get active transfer window
    const activeWindows = await fantasySql`
      SELECT * FROM fantasy_transfer_windows
      WHERE league_id = ${leagueId}
        AND is_active = true
      LIMIT 1
    `;

    if (activeWindows.length === 0) {
      return NextResponse.json({
        success: true,
        active_window: null,
        submissions: [],
        conflicts: {}
      });
    }

    const window = activeWindows[0];

    // Fetch all submissions for active window
    const submissions = await fantasySql`
      SELECT s.*, 
        t.team_name,
        p_out.player_name as player_out_name,
        sq.purchase_price as player_out_price,
        p_in.player_name as player_in_name,
        p_in.current_price as player_in_price
      FROM fantasy_transfer_submissions s
      JOIN fantasy_teams t ON t.team_id = s.team_id
      LEFT JOIN fantasy_squad sq ON sq.team_id = s.team_id AND sq.real_player_id = s.player_out_id
      LEFT JOIN fantasy_players p_out ON p_out.real_player_id = s.player_out_id AND p_out.league_id = s.league_id
      LEFT JOIN fantasy_players p_in ON p_in.real_player_id = s.player_in_id AND p_in.league_id = s.league_id
      WHERE s.window_id = ${window.window_id}
      ORDER BY s.created_at ASC
    `;

    // Group by requested player (player_in_id) to identify conflicts
    const playerRequests: Record<string, any[]> = {};
    submissions.forEach(sub => {
      const pInId = sub.player_in_id;
      if (!playerRequests[pInId]) {
        playerRequests[pInId] = [];
      }
      playerRequests[pInId].push({
        submission_id: sub.id,
        team_id: sub.team_id,
        team_name: sub.team_name,
        player_out_id: sub.player_out_id,
        player_out_name: sub.player_out_name,
        player_out_price: sub.player_out_price,
        player_in_name: sub.player_in_name,
        player_in_price: sub.player_in_price,
        created_at: sub.created_at
      });
    });

    const conflicts: Record<string, { player_name: string, price: number, requests: any[] }> = {};
    const autoApprovals: any[] = [];

    Object.entries(playerRequests).forEach(([pInId, reqs]) => {
      if (reqs.length > 1) {
        conflicts[pInId] = {
          player_name: reqs[0].player_in_name,
          price: Number(reqs[0].player_in_price),
          requests: reqs
        };
      } else {
        autoApprovals.push({
          player_in_id: pInId,
          ...reqs[0]
        });
      }
    });

    return NextResponse.json({
      success: true,
      active_window: window,
      submissions,
      conflicts,
      auto_approvals: autoApprovals
    });

  } catch (error: any) {
    console.error('Error fetching admin transfer submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin transfer submissions', details: error.message },
      { status: 500 }
    );
  }
}
