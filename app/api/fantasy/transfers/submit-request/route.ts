import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/transfers/submit-request
 * Submit a pending transfer request for the active window
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      player_out_id, // real_player_id of player to release
      player_in_id,  // real_player_id of player to sign
    } = body;

    if (!user_id || !player_out_id || !player_in_id) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id, player_out_id, and player_in_id are required' },
        { status: 400 }
      );
    }

    // Get user's fantasy team
    const teams = await fantasySql`
      SELECT * FROM fantasy_teams
      WHERE owner_uid = ${user_id} AND is_enabled = true
      LIMIT 1
    `;

    if (teams.length === 0) {
      return NextResponse.json(
        { error: 'No fantasy team found' },
        { status: 404 }
      );
    }

    const team = teams[0];
    const teamId = team.team_id;
    const leagueId = team.league_id;

    // Check if transfer window is open
    const activeWindows = await fantasySql`
      SELECT * FROM fantasy_transfer_windows
      WHERE league_id = ${leagueId}
        AND is_active = true
      LIMIT 1
    `;

    if (activeWindows.length === 0) {
      return NextResponse.json(
        { error: 'No active transfer window is open' },
        { status: 400 }
      );
    }

    const window = activeWindows[0];

    // Verify player_out is in team's squad
    const playerOutCheck = await fantasySql`
      SELECT * FROM fantasy_squad
      WHERE team_id = ${teamId}
        AND real_player_id = ${player_out_id}
      LIMIT 1
    `;

    if (playerOutCheck.length === 0) {
      return NextResponse.json(
        { error: 'Player to release is not in your squad' },
        { status: 400 }
      );
    }

    const playerOut = playerOutCheck[0];

    // Verify player_in is in fantasy_players and available
    const playerInCheck = await fantasySql`
      SELECT * FROM fantasy_players
      WHERE league_id = ${leagueId}
        AND real_player_id = ${player_in_id}
      LIMIT 1
    `;

    if (playerInCheck.length === 0) {
      return NextResponse.json(
        { error: 'Requested player not found in the league' },
        { status: 400 }
      );
    }

    const playerIn = playerInCheck[0];

    // Check if player_in is already in team's squad
    const inSquadCheck = await fantasySql`
      SELECT real_player_id FROM fantasy_squad
      WHERE team_id = ${teamId}
        AND real_player_id = ${player_in_id}
      LIMIT 1
    `;

    if (inSquadCheck.length > 0) {
      return NextResponse.json(
        { error: 'Requested player is already in your squad' },
        { status: 400 }
      );
    }

    // Verify budget
    const refund = Number(playerOut.purchase_price || 0);
    const cost = Number(playerIn.current_price || playerIn.draft_price || 0);
    const newBudget = Number(team.budget_remaining) + refund - cost;

    if (newBudget < 0) {
      return NextResponse.json(
        { error: `Insufficient budget. Required: ${cost} Cr, Available after refund: ${(Number(team.budget_remaining) + refund)} Cr` },
        { status: 400 }
      );
    }

    // Save or update submission
    await fantasySql`
      INSERT INTO fantasy_transfer_submissions (
        league_id,
        window_id,
        team_id,
        player_out_id,
        player_in_id
      ) VALUES (
        ${leagueId},
        ${window.window_id},
        ${teamId},
        ${player_out_id},
        ${player_in_id}
      )
      ON CONFLICT (window_id, team_id) 
      DO UPDATE SET 
        player_out_id = EXCLUDED.player_out_id,
        player_in_id = EXCLUDED.player_in_id,
        created_at = CURRENT_TIMESTAMP
    `;

    return NextResponse.json({
      success: true,
      message: 'Transfer request submitted successfully. It will be finalized when the window closes.',
      details: {
        releasing: playerOut.player_name,
        requesting: playerIn.player_name,
        cost: cost,
        refund: refund,
        estimated_budget_after: newBudget
      }
    });

  } catch (error: any) {
    console.error('Error submitting transfer request:', error);
    return NextResponse.json(
      { error: 'Failed to submit transfer request', details: error.message },
      { status: 500 }
    );
  }
}
