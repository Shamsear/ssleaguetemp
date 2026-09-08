import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * GET /api/fantasy/swaps?league_id=xxx&team_id=yyy&window_id=zzz
 * Fetch swapped players log with transfer window details
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const teamId = searchParams.get('team_id');
    const windowId = searchParams.get('window_id');

    if (!leagueId && !teamId) {
      return NextResponse.json(
        { error: 'league_id or team_id is required' },
        { status: 400 }
      );
    }

    let swaps;
    if (teamId) {
      swaps = await fantasySql`
        SELECT 
          fs.swap_id,
          fs.league_id,
          fs.team_id,
          ft.team_name,
          fs.window_id,
          tw.window_name,
          tw.opens_at as window_opens_at,
          tw.closes_at as window_closes_at,
          fs.player_out_id,
          fs.player_out_name,
          fs.player_out_price,
          fs.player_in_id,
          fs.player_in_name,
          fs.player_in_price,
          fs.price_difference,
          fs.status,
          fs.swapped_at
        FROM fantasy_swaps fs
        LEFT JOIN fantasy_teams ft ON fs.team_id = ft.team_id
        LEFT JOIN fantasy_transfer_windows tw ON fs.window_id = tw.window_id
        WHERE fs.team_id = ${teamId}
          ${windowId ? fantasySql`AND fs.window_id = ${windowId}` : fantasySql``}
        ORDER BY fs.swapped_at DESC
      `;
    } else {
      swaps = await fantasySql`
        SELECT 
          fs.swap_id,
          fs.league_id,
          fs.team_id,
          ft.team_name,
          fs.window_id,
          tw.window_name,
          tw.opens_at as window_opens_at,
          tw.closes_at as window_closes_at,
          fs.player_out_id,
          fs.player_out_name,
          fs.player_out_price,
          fs.player_in_id,
          fs.player_in_name,
          fs.player_in_price,
          fs.price_difference,
          fs.status,
          fs.swapped_at
        FROM fantasy_swaps fs
        LEFT JOIN fantasy_teams ft ON fs.team_id = ft.team_id
        LEFT JOIN fantasy_transfer_windows tw ON fs.window_id = tw.window_id
        WHERE fs.league_id = ${leagueId}
          ${windowId ? fantasySql`AND fs.window_id = ${windowId}` : fantasySql``}
        ORDER BY fs.swapped_at DESC
      `;
    }

    return NextResponse.json({
      success: true,
      swaps
    });
  } catch (error: any) {
    console.error('Error fetching swaps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch swaps', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fantasy/swaps
 * Perform a player swap (Player OUT, Player IN)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth([], request);
    if (!auth.authenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { team_id, league_id, player_out_id, player_in_id, window_id } = body;

    if (!team_id || !league_id || !player_out_id || !player_in_id) {
      return NextResponse.json(
        { error: 'Missing required parameters: team_id, league_id, player_out_id, player_in_id' },
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

    // 2. Get player OUT details from squad
    const [squadPlayerOut] = await fantasySql`
      SELECT s.squad_id, s.purchase_price, p.player_name
      FROM fantasy_squad s
      LEFT JOIN fantasy_players p ON s.real_player_id = p.real_player_id AND p.league_id = ${league_id}
      WHERE s.team_id = ${team_id} AND s.real_player_id = ${player_out_id}
    `;

    if (!squadPlayerOut) {
      return NextResponse.json({ error: 'Player OUT not found in your squad' }, { status: 400 });
    }

    // 3. Get player IN details
    const [playerIn] = await fantasySql`
      SELECT real_player_id, player_name, price, is_available
      FROM fantasy_players
      WHERE real_player_id = ${player_in_id} AND league_id = ${league_id}
    `;

    if (!playerIn || !playerIn.is_available) {
      return NextResponse.json({ error: 'Player IN is not available' }, { status: 400 });
    }

    const playerOutPrice = parseFloat(squadPlayerOut.purchase_price || 0);
    const playerInPrice = parseFloat(playerIn.price || 0);
    const currentBudget = parseFloat(team.budget || 0);

    // Calculate budget delta: refund for player OUT, spend for player IN
    const priceDifference = playerInPrice - playerOutPrice;
    if (currentBudget < priceDifference) {
      return NextResponse.json(
        { error: `Insufficient budget for swap. Needed: ₹${priceDifference}M, Available: ₹${currentBudget}M` },
        { status: 400 }
      );
    }

    const newBudget = currentBudget - priceDifference;

    // 4. Perform Swap Transaction
    // Remove Player OUT from squad
    await fantasySql`
      DELETE FROM fantasy_squad
      WHERE squad_id = ${squadPlayerOut.squad_id}
    `;

    // Mark Player OUT as available
    await fantasySql`
      UPDATE fantasy_players
      SET is_available = true, updated_at = NOW()
      WHERE real_player_id = ${player_out_id} AND league_id = ${league_id}
    `;

    // Add Player IN to squad
    const newSquadId = `squad_${team_id}_${player_in_id}_${Date.now()}`;
    await fantasySql`
      INSERT INTO fantasy_squad (
        squad_id, team_id, real_player_id, purchase_price, added_at
      ) VALUES (
        ${newSquadId}, ${team_id}, ${player_in_id}, ${playerInPrice}, NOW()
      )
    `;

    // Mark Player IN as unavailable
    await fantasySql`
      UPDATE fantasy_players
      SET is_available = false, updated_at = NOW()
      WHERE real_player_id = ${player_in_id} AND league_id = ${league_id}
    `;

    // Update Team Budget
    await fantasySql`
      UPDATE fantasy_teams
      SET budget = ${newBudget}, updated_at = NOW()
      WHERE team_id = ${team_id}
    `;

    // Log Swap in fantasy_swaps
    const swapId = `swap_${team_id}_${Date.now()}`;
    await fantasySql`
      INSERT INTO fantasy_swaps (
        swap_id, league_id, team_id, window_id,
        player_out_id, player_out_name, player_out_price,
        player_in_id, player_in_name, player_in_price,
        price_difference, status, swapped_at, created_at
      ) VALUES (
        ${swapId}, ${league_id}, ${team_id}, ${window_id || null},
        ${player_out_id}, ${squadPlayerOut.player_name || player_out_id}, ${playerOutPrice},
        ${player_in_id}, ${playerIn.player_name || player_in_id}, ${playerInPrice},
        ${priceDifference}, 'completed', NOW(), NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'Player swapped successfully',
      swap_id: swapId,
      new_budget: newBudget
    });

  } catch (error: any) {
    console.error('Error executing swap:', error);
    return NextResponse.json(
      { error: 'Failed to execute swap', details: error.message },
      { status: 500 }
    );
  }
}
