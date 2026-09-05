import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * POST /api/admin/fantasy/transfers/finalize
 * Finalize all submissions for the active window, resolving conflicts using admin-supplied tiebreaker values.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized - Committee access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { league_id, window_id, resolutions } = body; // resolutions: { [player_in_id]: { winning_team_id: string, bid_price: number } }

    if (!league_id || !window_id) {
      return NextResponse.json(
        { error: 'league_id and window_id are required' },
        { status: 400 }
      );
    }

    const sql = fantasySql;

    // Check if transfer window exists and is active
    const windowResult = await sql`
      SELECT * FROM fantasy_transfer_windows
      WHERE window_id = ${window_id}
        AND league_id = ${league_id}
        AND is_active = true
      LIMIT 1
    `;

    if (windowResult.length === 0) {
      return NextResponse.json(
        { error: 'Specified transfer window is not active or does not exist' },
        { status: 404 }
      );
    }

    // Get all submissions for this window
    const submissions = await sql`
      SELECT s.*, 
        sq.purchase_price as player_out_price,
        p_in.player_name as player_in_name,
        p_in.current_price as player_in_price
      FROM fantasy_transfer_submissions s
      LEFT JOIN fantasy_squad sq ON sq.team_id = s.team_id AND sq.real_player_id = s.player_out_id
      LEFT JOIN fantasy_players p_in ON p_in.real_player_id = s.player_in_id AND p_in.league_id = s.league_id
      WHERE s.window_id = ${window_id}
    `;

    if (submissions.length === 0) {
      // Close window and return success
      await sql`
        UPDATE fantasy_transfer_windows
        SET is_active = false, updated_at = NOW()
        WHERE window_id = ${window_id}
      `;
      return NextResponse.json({
        success: true,
        message: 'No submissions found. Transfer window closed successfully.'
      });
    }

    // Group submissions by player_in_id to count requests
    const requestGroups: Record<string, any[]> = {};
    submissions.forEach((sub: any) => {
      const pInId = sub.player_in_id;
      if (!requestGroups[pInId]) {
        requestGroups[pInId] = [];
      }
      requestGroups[pInId].push(sub);
    });

    const finalizedTransfers = [];
    const errors = [];

    // Begin processing
    for (const [playerInId, subs] of Object.entries(requestGroups)) {
      let winningSub = null;
      let finalPrice = 0;

      if (subs.length === 1) {
        // Auto-approve
        winningSub = subs[0];
        finalPrice = Number(winningSub.player_in_price || 0);
      } else {
        // Conflicted - resolve using admin resolutions input
        const resolution = resolutions?.[playerInId];
        if (!resolution || !resolution.winning_team_id) {
          errors.push(`Conflict for player ${subs[0].player_in_name} has no tiebreaker resolution provided.`);
          continue;
        }

        winningSub = subs.find(s => s.team_id === resolution.winning_team_id);
        if (!winningSub) {
          errors.push(`Invalid winning team specified in resolution for player ${subs[0].player_in_name}.`);
          continue;
        }
        finalPrice = Number(resolution.bid_price || winningSub.player_in_price || 0);
      }

      // Process the winning submission
      try {
        const teamId = winningSub.team_id;
        const playerOutId = winningSub.player_out_id;
        const refund = Number(winningSub.player_out_price || 0);

        // Fetch team details to verify budget
        const teamResult = await sql`
          SELECT budget_remaining, total_points FROM fantasy_teams WHERE team_id = ${teamId} LIMIT 1
        `;
        if (teamResult.length === 0) {
          errors.push(`Team ${teamId} not found.`);
          continue;
        }
        const team = teamResult[0];
        const newBudget = Number(team.budget_remaining) + refund - finalPrice;

        if (newBudget < 0) {
          errors.push(`Team cannot afford player ${winningSub.player_in_name}. Needed: ${finalPrice} Cr, Available after refund: ${Number(team.budget_remaining) + refund} Cr.`);
          continue;
        }

        // 1. Get info of player out (for history logs)
        const squadOut = await sql`
          SELECT player_name FROM fantasy_squad WHERE team_id = ${teamId} AND real_player_id = ${playerOutId} LIMIT 1
        `;
        const playerOutName = squadOut[0]?.player_name || playerOutId;

        // 2. Remove player out from squad
        await sql`
          DELETE FROM fantasy_squad
          WHERE team_id = ${teamId}
            AND real_player_id = ${playerOutId}
        `;

        // 3. Mark player out as available in the transfer list
        await sql`
          UPDATE fantasy_players
          SET is_available = true
          WHERE league_id = ${league_id}
            AND real_player_id = ${playerOutId}
        `;

        // 4. Add player in to squad
        const squadId = `squad_${teamId}_${playerInId}_${Date.now()}`;
        await sql`
          INSERT INTO fantasy_squad (
            squad_id, team_id, league_id, real_player_id,
            player_name, position, real_team_name,
            purchase_price, current_value, acquisition_type
          ) VALUES (
            ${squadId}, ${teamId}, ${league_id}, ${playerInId},
            ${winningSub.player_in_name}, 
            (SELECT position FROM fantasy_players WHERE real_player_id = ${playerInId} LIMIT 1),
            (SELECT real_team_name FROM fantasy_players WHERE real_player_id = ${playerInId} LIMIT 1),
            ${finalPrice}, ${finalPrice}, 'transfer'
          )
        `;

        // 5. Mark player in as unavailable in transfer list
        await sql`
          UPDATE fantasy_players
          SET is_available = false
          WHERE league_id = ${league_id}
            AND real_player_id = ${playerInId}
        `;

        // 6. Deduct budget from team
        await sql`
          UPDATE fantasy_teams
          SET budget_remaining = ${newBudget}, updated_at = NOW()
          WHERE team_id = ${teamId}
        `;

        // 7. Log transaction in fantasy_transfers
        const transferId = `trans_${teamId}_${Date.now()}`;
        await sql`
          INSERT INTO fantasy_transfers (
            transfer_id, league_id, team_id, window_id,
            player_out_id, player_out_name,
            player_in_id, player_in_name,
            transfer_cost, points_deducted, is_free_transfer
          ) VALUES (
            ${transferId}, ${league_id}, ${teamId}, ${window_id},
            ${playerOutId}, ${playerOutName},
            ${playerInId}, ${winningSub.player_in_name},
            ${finalPrice}, 0, true
          )
        `;

        finalizedTransfers.push({
          team_id: teamId,
          player_out: playerOutName,
          player_in: winningSub.player_in_name,
          price: finalPrice
        });

      } catch (err: any) {
        errors.push(`Error executing transfer for player ${winningSub.player_in_name}: ${err.message}`);
      }
    }

    if (errors.length > 0 && finalizedTransfers.length === 0) {
      return NextResponse.json(
        { error: 'Failed to finalize transfers', details: errors },
        { status: 400 }
      );
    }

    // Delete all submissions for this window since they are finalized
    await sql`
      DELETE FROM fantasy_transfer_submissions
      WHERE window_id = ${window_id}
    `;

    // Force close transfer window
    await sql`
      UPDATE fantasy_transfer_windows
      SET is_active = false, updated_at = NOW()
      WHERE window_id = ${window_id}
    `;

    return NextResponse.json({
      success: true,
      message: `Finalized transfers for ${finalizedTransfers.length} teams.`,
      transfers: finalizedTransfers,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error: any) {
    console.error('Error finalising transfer submissions:', error);
    return NextResponse.json(
      { error: 'Failed to finalize transfer submissions', details: error.message },
      { status: 500 }
    );
  }
}
