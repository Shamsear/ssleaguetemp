import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/transfers/current-submission
 * Get the current team's pending transfer request for the active window
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const teamIdParam = searchParams.get('team_id');

    if (!userId && !teamIdParam) {
      return NextResponse.json(
        { error: 'user_id or team_id is required' },
        { status: 400 }
      );
    }

    let teamId = teamIdParam;
    let leagueId = '';

    if (userId) {
      const teams = await fantasySql`
        SELECT team_id, league_id FROM fantasy_teams
        WHERE owner_uid = ${userId} AND is_enabled = true
        LIMIT 1
      `;
      if (teams.length === 0) {
        return NextResponse.json(
          { error: 'No fantasy team found' },
          { status: 404 }
        );
      }
      teamId = teams[0].team_id;
      leagueId = teams[0].league_id;
    } else {
      const teams = await fantasySql`
        SELECT league_id FROM fantasy_teams
        WHERE team_id = ${teamId}
        LIMIT 1
      `;
      if (teams.length === 0) {
        return NextResponse.json(
          { error: 'No fantasy team found' },
          { status: 404 }
        );
      }
      leagueId = teams[0].league_id;
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
        submission: null
      });
    }

    const window = activeWindows[0];

    // Get submission for this team in active window
    const submissions = await fantasySql`
      SELECT s.*, 
        p_out.player_name as player_out_name,
        p_out.position as player_out_position,
        p_out.real_team_name as player_out_real_team,
        sq.purchase_price as player_out_price,
        p_in.player_name as player_in_name,
        p_in.position as player_in_position,
        p_in.real_team_name as player_in_real_team,
        p_in.current_price as player_in_price
      FROM fantasy_transfer_submissions s
      LEFT JOIN fantasy_squad sq ON sq.team_id = s.team_id AND sq.real_player_id = s.player_out_id
      LEFT JOIN fantasy_players p_out ON p_out.real_player_id = s.player_out_id AND p_out.league_id = s.league_id
      LEFT JOIN fantasy_players p_in ON p_in.real_player_id = s.player_in_id AND p_in.league_id = s.league_id
      WHERE s.team_id = ${teamId}
        AND s.window_id = ${window.window_id}
      LIMIT 1
    `;

    return NextResponse.json({
      success: true,
      active_window: window,
      submission: submissions.length > 0 ? submissions[0] : null
    });

  } catch (error: any) {
    console.error('Error fetching current transfer submission:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer submission', details: error.message },
      { status: 500 }
    );
  }
}
