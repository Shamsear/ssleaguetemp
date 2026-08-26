import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/captain-windows/current
 * Get the current active captain window for a league
 * 
 * Query params:
 * - league_id: Required
 * - team_id: Optional (returns team's current captain selections)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const teamId = searchParams.get('team_id');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'league_id is required' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Get current open window
    const windows = await sql`
      SELECT 
        window_id,
        league_id,
        round_id,
        round_number,
        round_name,
        window_status,
        opens_at,
        closes_at,
        total_teams,
        teams_with_captain_set,
        created_at,
        updated_at,
        start_round,
        end_round
      FROM fantasy_captain_windows
      WHERE league_id = ${leagueId}
        AND window_status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (windows.length === 0) {
      return NextResponse.json({
        success: true,
        current_window: null,
        is_open: false,
        message: 'No active captain window'
      });
    }

    const currentWindow = windows[0];

    // Calculate time remaining
    const now = new Date();
    const closesAt = new Date(currentWindow.closes_at);
    const timeRemainingMs = closesAt.getTime() - now.getTime();
    const timeRemainingSeconds = Math.max(0, Math.floor(timeRemainingMs / 1000));

    // Check if window should auto-close
    const isOpen = currentWindow.window_status === 'open' && timeRemainingMs > 0;

    // Get team's current selections if team_id provided
    let currentSelections = null;
    let teamHasSetCaptain = false;

    if (teamId) {
      const selections = await sql`
        SELECT 
          captain_player_id,
          vice_captain_player_id
        FROM fantasy_captain_history
        WHERE league_id = ${leagueId}
          AND team_id = ${teamId}
          AND window_id = ${currentWindow.window_id}
        ORDER BY changed_at DESC
        LIMIT 1
      `;

      if (selections.length > 0) {
        teamHasSetCaptain = true;
        const capId = selections[0].captain_player_id;
        const vcId = selections[0].vice_captain_player_id;

        const players = await sql`
          SELECT real_player_id, player_name
          FROM fantasy_players
          WHERE league_id = ${leagueId}
            AND real_player_id IN (${capId || ''}, ${vcId || ''})
        `;
        const capName = players.find((p: any) => p.real_player_id === capId)?.player_name || capId;
        const vcName = players.find((p: any) => p.real_player_id === vcId)?.player_name || vcId;

        currentSelections = {
          captain_player_id: capId,
          captain_player_name: capName,
          vice_captain_player_id: vcId,
          vice_captain_player_name: vcName
        };
      } else {
        const squadSelections = await sql`
          SELECT real_player_id, player_name, is_captain, is_vice_captain
          FROM fantasy_squad
          WHERE league_id = ${leagueId}
            AND team_id = ${teamId}
            AND (is_captain = true OR is_vice_captain = true)
          ORDER BY is_captain DESC
        `;
        if (squadSelections.length > 0) {
          const captain = squadSelections.find((s: any) => s.is_captain);
          const viceCaptain = squadSelections.find((s: any) => s.is_vice_captain);
          currentSelections = {
            captain_player_id: captain?.real_player_id || null,
            captain_player_name: captain?.player_name || null,
            vice_captain_player_id: viceCaptain?.real_player_id || null,
            vice_captain_player_name: viceCaptain?.player_name || null
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      current_window: {
        ...currentWindow,
        time_remaining_seconds: timeRemainingSeconds,
        is_open: isOpen
      },
      team_has_set_captain: teamHasSetCaptain,
      current_selections: currentSelections
    });
  } catch (error: any) {
    console.error('Error fetching current captain window:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current captain window', details: error.message },
      { status: 500 }
    );
  }
}
