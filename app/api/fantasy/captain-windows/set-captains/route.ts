import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/captain-windows/set-captains
 * Set captain and vice-captain for a team
 * 
 * Body:
 * - window_id: Required
 * - team_id: Required
 * - captain_player_id: Required
 * - vice_captain_player_id: Required
 * - user_id: Required (for audit trail)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      window_id,
      team_id,
      captain_player_id,
      vice_captain_player_id,
      user_id
    } = body;

    // Validation
    if (!window_id || !team_id || !captain_player_id || !vice_captain_player_id || !user_id) {
      return NextResponse.json(
        { error: 'window_id, team_id, captain_player_id, vice_captain_player_id, and user_id are required' },
        { status: 400 }
      );
    }

    // Captain and VC must be different
    if (captain_player_id === vice_captain_player_id) {
      return NextResponse.json(
        { error: 'Captain and vice-captain must be different players' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Check if window exists and is open
    const window = await sql`
      SELECT * FROM fantasy_captain_windows
      WHERE window_id = ${window_id}
    `;

    if (window.length === 0) {
      return NextResponse.json(
        { error: 'Captain window not found' },
        { status: 404 }
      );
    }

    if (window[0].window_status !== 'open') {
      return NextResponse.json(
        { error: `Window is ${window[0].window_status}. Captain selection is only allowed when window is open.` },
        { status: 403 }
      );
    }

    // Check if window is still within time
    const now = new Date();
    const closesAt = new Date(window[0].closes_at);
    if (now > closesAt) {
      return NextResponse.json(
        { error: 'Captain selection window has expired' },
        { status: 403 }
      );
    }

    const leagueId = window[0].league_id;
    const roundId = window[0].round_id;

    // Verify team exists and belongs to this league
    const team = await sql`
      SELECT * FROM fantasy_teams
      WHERE team_id = ${team_id}
        AND league_id = ${leagueId}
    `;

    if (team.length === 0) {
      return NextResponse.json(
        { error: 'Team not found in this league' },
        { status: 404 }
      );
    }

    // Verify both players are in the team's squad
    const squad = await sql`
      SELECT real_player_id, player_name
      FROM fantasy_squad
      WHERE team_id = ${team_id}
        AND league_id = ${leagueId}
        AND real_player_id IN (${captain_player_id}, ${vice_captain_player_id})
    `;

    if (squad.length !== 2) {
      return NextResponse.json(
        { error: 'Both captain and vice-captain must be in your squad' },
        { status: 400 }
      );
    }

    // Check if team already has captain set for this window
    const hadCaptainBefore = await sql`
      SELECT COUNT(*) as count
      FROM fantasy_captain_history
      WHERE team_id = ${team_id}
        AND league_id = ${leagueId}
        AND window_id = ${window_id}
    `;

    const isFirstTime = parseInt(hadCaptainBefore[0]?.count || '0') === 0;

    // Update active captain in squad
    await sql`
      UPDATE fantasy_squad
      SET is_captain = false, is_vice_captain = false
      WHERE team_id = ${team_id} AND league_id = ${leagueId}
    `;

    await sql`
      UPDATE fantasy_squad
      SET is_captain = true
      WHERE team_id = ${team_id} AND league_id = ${leagueId} AND real_player_id = ${captain_player_id}
    `;

    await sql`
      UPDATE fantasy_squad
      SET is_vice_captain = true
      WHERE team_id = ${team_id} AND league_id = ${leagueId} AND real_player_id = ${vice_captain_player_id}
    `;

    // Update points multiplier in fantasy_player_points only for rounds in this window range
    const startRound = window[0].start_round || window[0].round_number || 1;
    const endRound = window[0].end_round || window[0].round_number || 1;

    await sql`
      UPDATE fantasy_player_points
      SET 
        is_captain = false,
        is_vice_captain = false,
        points_multiplier = 1
      WHERE team_id = ${team_id}
        AND league_id = ${leagueId}
        AND round_number >= ${startRound}
        AND round_number <= ${endRound}
    `;

    await sql`
      UPDATE fantasy_player_points
      SET 
        is_captain = true,
        points_multiplier = 2
      WHERE team_id = ${team_id}
        AND league_id = ${leagueId}
        AND real_player_id = ${captain_player_id}
        AND round_number >= ${startRound}
        AND round_number <= ${endRound}
    `;

    await sql`
      UPDATE fantasy_player_points
      SET 
        is_vice_captain = true
      WHERE team_id = ${team_id}
        AND league_id = ${leagueId}
        AND real_player_id = ${vice_captain_player_id}
        AND round_number >= ${startRound}
        AND round_number <= ${endRound}
    `;

    // Get player names for response
    const captainInfo = squad.find((p: any) => p.real_player_id === captain_player_id);
    const vcInfo = squad.find((p: any) => p.real_player_id === vice_captain_player_id);

    // Log to history
    const historyId = `ch_${team_id}_${roundId}_${Date.now()}`;
    await sql`
      INSERT INTO fantasy_captain_history (
        history_id,
        league_id,
        team_id,
        round_id,
        window_id,
        captain_player_id,
        vice_captain_player_id,
        changed_by_user_id,
        notes
      ) VALUES (
        ${historyId},
        ${leagueId},
        ${team_id},
        ${roundId},
        ${window_id},
        ${captain_player_id},
        ${vice_captain_player_id},
        ${user_id},
        ${isFirstTime ? 'Initial captain selection' : 'Captain changed'}
      )
    `;

    // Update teams_with_captain_set counter if this is first time
    if (isFirstTime) {
      await sql`
        UPDATE fantasy_captain_windows
        SET teams_with_captain_set = teams_with_captain_set + 1
        WHERE window_id = ${window_id}
      `;
    }

    return NextResponse.json({
      success: true,
      captain: {
        player_id: captain_player_id,
        player_name: captainInfo?.player_name || 'Unknown',
        multiplier: 2
      },
      vice_captain: {
        player_id: vice_captain_player_id,
        player_name: vcInfo?.player_name || 'Unknown',
        multiplier: 2
      },
      recorded_at: new Date().toISOString(),
      message: isFirstTime ? 'Captain and vice-captain set successfully' : 'Captain and vice-captain updated successfully'
    });
  } catch (error: any) {
    console.error('Error setting captains:', error);
    return NextResponse.json(
      { error: 'Failed to set captains', details: error.message },
      { status: 500 }
    );
  }
}
