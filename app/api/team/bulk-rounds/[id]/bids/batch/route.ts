import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { getAuctionSettings } from '@/lib/auction-settings';
import { broadcastRoundUpdate } from '@/lib/realtime/broadcast';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_AUCTION_DB_URL!);

/**
 * POST /api/team/bulk-rounds/:id/bids/batch
 * Submit multiple bids for players in a bulk round as a single batch operation.
 * Eliminates per-click DB writes and Realtime DB pushes, saving quota.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const firebaseUid = auth.userId!;
    const { id: roundId } = await params;
    const body = await request.json();
    const { player_ids } = body; // Array of player IDs representing all currently selected players

    if (!player_ids || !Array.isArray(player_ids)) {
      return NextResponse.json(
        { success: false, error: 'player_ids array is required' },
        { status: 400 }
      );
    }

    // Get team_id and team_name from teams table using firebase_uid
    const teamResult = await sql`
      SELECT id, name FROM teams
      WHERE firebase_uid = ${firebaseUid}
    `;

    if (teamResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Team not found. Please ensure your team is registered.' },
        { status: 404 }
      );
    }

    const teamId = teamResult[0].id;
    const teamName = teamResult[0].name || 'Team';

    // Get round details
    const roundCheck = await sql`
      SELECT id, status, base_price, season_id, round_number
      FROM rounds
      WHERE id = ${roundId}
      AND round_type = 'bulk'
    `;

    if (roundCheck.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Bulk round not found' },
        { status: 404 }
      );
    }

    const round = roundCheck[0];

    if (round.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `Round is not active. Current status: ${round.status}` },
        { status: 400 }
      );
    }

    // Get auction settings
    let auctionSettings;
    try {
      auctionSettings = await getAuctionSettings(round.season_id);
    } catch (error: any) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    const MAX_SQUAD_SIZE = auctionSettings.max_squad_size;

    // Get team data to check slots
    const teamData = await sql`
      SELECT 
        football_players_count,
        football_total_slots,
        football_budget
      FROM teams
      WHERE id = ${teamId}
      AND season_id = ${round.season_id}
    `;

    if (teamData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Team data not found' },
        { status: 404 }
      );
    }

    const currentSquadSize = parseInt(teamData[0].football_players_count) || 0;
    const teamMaxSlots = parseInt(teamData[0].football_total_slots) || MAX_SQUAD_SIZE;
    const balance = parseInt(teamData[0].football_budget) || 1000;

    // Validate squad slots
    const requestedBidsCount = player_ids.length;
    const availableSlots = teamMaxSlots - currentSquadSize;

    if (requestedBidsCount > availableSlots) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient squad slots. You are trying to place ${requestedBidsCount} bids, but you only have ${availableSlots} slots available (Squad: ${currentSquadSize}/${teamMaxSlots}).` 
        },
        { status: 400 }
      );
    }

    // Validate budget
    const totalCost = requestedBidsCount * round.base_price;
    if (balance < totalCost) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient balance. Required: £${totalCost}, Available: £${balance}` 
        },
        { status: 400 }
      );
    }

    // Validate players exist in round and are not sold
    if (player_ids.length > 0) {
      const validPlayers = await sql`
        SELECT player_id, player_name, status
        FROM round_players
        WHERE round_id = ${roundId}
        AND player_id = ANY(${player_ids})
      `;

      if (validPlayers.length !== player_ids.length) {
        return NextResponse.json(
          { success: false, error: 'One or more selected players are not found in this round' },
          { status: 400 }
        );
      }

      for (const player of validPlayers) {
        if (player.status === 'sold') {
          return NextResponse.json(
            { success: false, error: `Player ${player.player_name} is already sold` },
            { status: 400 }
          );
        }
      }
    }

    console.log(`⚡ [Bulk Batch Save] Saving ${player_ids.length} bids for team ${teamId} in bulk round ${roundId}`);

    // Perform transaction: delete old bids, write new bids
    await sql`
      DELETE FROM round_bids
      WHERE round_id = ${roundId}
      AND team_id = ${teamId}
    `;

    const insertedBids = [];
    for (const player_id of player_ids) {
      const insertResult = await sql`
        INSERT INTO round_bids (
          round_id, season_id, player_id, team_id, team_name, bid_amount, bid_time
        ) VALUES (
          ${roundId}, ${round.season_id}, ${player_id}, ${teamId}, ${teamName}, ${round.base_price}, NOW()
        )
        RETURNING id, player_id, bid_amount
      `;
      insertedBids.push(insertResult[0]);
    }

    // Broadcast update via Firebase Realtime DB
    await broadcastRoundUpdate(round.season_id, roundId, {
      type: 'bulk_bids_updated',
      team_id: teamId,
      team_name: teamName,
      round_id: roundId,
      bids_count: player_ids.length,
      player_ids: player_ids
    });

    return NextResponse.json({
      success: true,
      data: {
        round_id: roundId,
        round_number: round.round_number,
        bids: insertedBids,
        total_reserved: totalCost,
        remaining_balance: balance - totalCost,
        remaining_slots: availableSlots - requestedBidsCount,
        message: `Successfully saved ${player_ids.length} bids`
      }
    });

  } catch (error: any) {
    console.error('Error bulk-batch saving bids:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
