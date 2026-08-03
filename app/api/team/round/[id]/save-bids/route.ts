import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { encryptBidData, decryptBidData } from '@/lib/encryption';
import { broadcastRoundUpdate } from '@/lib/realtime/broadcast';
import { adminDb } from '@/lib/firebase/admin';
import { calculateReserve } from '@/lib/reserve-calculator';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * POST /api/team/round/[id]/save-bids
 * Batch save/update bids for a team in a standard round.
 * Reduces database writes and Realtime DB broadcasts to exactly 1 request.
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

    const userId = auth.userId!;
    const { id: roundId } = await params;

    const body = await request.json();
    const { bids } = body; // Array of { player_id: string, amount: number }

    if (!bids || !Array.isArray(bids)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing bids array' },
        { status: 400 }
      );
    }

    // Get team ID for this user from database
    const teamResult = await sql`
      SELECT id, name FROM teams WHERE firebase_uid = ${userId} LIMIT 1
    `;

    if (teamResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Team not registered or not found' },
        { status: 404 }
      );
    }

    const teamId = teamResult[0].id;
    const teamName = teamResult[0].name || 'Team';

    // Get round details
    const roundResult = await sql`
      SELECT id, position, max_bids_per_team, status, end_time, season_id
      FROM rounds
      WHERE id = ${roundId}
    `;

    if (roundResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Round not found' },
        { status: 404 }
      );
    }

    const round = roundResult[0];

    // Check round status
    if (round.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Round is not active' },
        { status: 400 }
      );
    }

    // Check if round has ended
    const now = new Date();
    const endTime = new Date(round.end_time);
    if (now > endTime) {
      return NextResponse.json(
        { success: false, error: 'Round has ended' },
        { status: 400 }
      );
    }

    // Check submission status: if team already locked submission, cannot modify bids
    const submissionResult = await sql`
      SELECT is_locked FROM bid_submissions
      WHERE team_id = ${teamId} AND round_id = ${roundId}
    `;
    if (submissionResult.length > 0 && submissionResult[0].is_locked) {
      return NextResponse.json(
        { success: false, error: 'Your bids are already locked and submitted' },
        { status: 400 }
      );
    }

    // Validate max bids count
    if (bids.length > round.max_bids_per_team) {
      return NextResponse.json(
        { success: false, error: `Maximum number of bids (${round.max_bids_per_team}) exceeded` },
        { status: 400 }
      );
    }

    // Validate bid amounts and check for duplicate amounts in this batch
    const amountsSet = new Set<number>();
    for (const bid of bids) {
      if (!bid.player_id || bid.amount === undefined) {
        return NextResponse.json(
          { success: false, error: 'Each bid must contain player_id and amount' },
          { status: 400 }
        );
      }
      if (bid.amount < 10) {
        return NextResponse.json(
          { success: false, error: 'Bid amount must be at least £10' },
          { status: 400 }
        );
      }
      if (amountsSet.has(bid.amount)) {
        return NextResponse.json(
          { success: false, error: `Duplicate bid amount detected: £${bid.amount}. Each bid must have a unique amount.` },
          { status: 400 }
        );
      }
      amountsSet.add(bid.amount);
    }

    // Get team's season data to check budget
    const teamSeasonId = `${teamId}_${round.season_id}`;
    let teamSeasonDoc = await adminDb.collection('team_seasons').doc(teamSeasonId).get();

    if (!teamSeasonDoc.exists) {
      const teamSeasonQuery = await adminDb.collection('team_seasons')
        .where('user_id', '==', userId)
        .where('season_id', '==', round.season_id)
        .where('status', '==', 'registered')
        .limit(1)
        .get();
      
      if (teamSeasonQuery.empty) {
        return NextResponse.json(
          { success: false, error: 'Team not registered for this season' },
          { status: 404 }
        );
      }
      teamSeasonDoc = teamSeasonQuery.docs[0];
    }

    const teamSeasonData = teamSeasonDoc.data();
    const currencySystem = teamSeasonData?.currency_system || 'single';
    const isDualCurrency = currencySystem === 'dual';
    const teamBalance = isDualCurrency ? (teamSeasonData?.football_budget || 0) : (teamSeasonData?.budget || 0);

    // Validate total budget
    let totalBidsAmount = 0;
    for (const bid of bids) {
      totalBidsAmount += bid.amount;
    }

    if (totalBidsAmount > teamBalance) {
      return NextResponse.json(
        { success: false, error: `Insufficient balance. Total bids amount £${totalBidsAmount} exceeds your budget £${teamBalance}` },
        { status: 400 }
      );
    }

    // Check reserve requirement
    try {
      const reserve = await calculateReserve(teamId, round.id, round.season_id);
      
      for (const bid of bids) {
        // Enforce reserves
        if ((reserve.phase === 'phase_2' && reserve.minimumReserve > 0) || reserve.requiresReserve) {
          const availableForBid = teamBalance - reserve.minimumReserve;
          if (bid.amount > availableForBid) {
            return NextResponse.json(
              { 
                success: false, 
                error: `Bid of £${bid.amount} exceeds available balance. You must maintain £${reserve.minimumReserve} for future rounds (${reserve.explanation}). Max allowed bid: £${Math.max(0, availableForBid)}` 
              },
              { status: 400 }
            );
          }
        }
      }
    } catch (reserveError) {
      console.error('Reserve check skipped due to error:', reserveError);
    }

    // Verify each player exists and is eligible for round positions
    const positions = round.position.split(',').map((p: string) => p.trim());
    
    for (const bid of bids) {
      const playerResult = await sql`
        SELECT id, name, position, position_group, is_auction_eligible, is_sold, team_id, retired
        FROM footballplayers 
        WHERE id = ${bid.player_id}
      `;

      if (playerResult.length === 0) {
        return NextResponse.json(
          { success: false, error: `Player not found: ${bid.player_id}` },
          { status: 404 }
        );
      }

      const player = playerResult[0];

      if (player.retired) {
        return NextResponse.json(
          { success: false, error: `Player ${player.name} is retired. Please delete their bid to continue.` },
          { status: 400 }
        );
      }

      if (!player.is_auction_eligible) {
        return NextResponse.json(
          { success: false, error: `Player ${player.name} is not eligible for auction` },
          { status: 400 }
        );
      }

      if (player.is_sold || (player.team_id && player.team_id !== '')) {
        return NextResponse.json(
          { success: false, error: `Player ${player.name} is already assigned to a team` },
          { status: 400 }
        );
      }

      // Check position groups (e.g. CF-1) or exact positions (e.g. CF)
      const positionMatches = positions.some((pos: string) => {
        const isPositionGroup = /^[A-Z]+-\d+$/.test(pos);
        return isPositionGroup ? player.position_group === pos : player.position === pos;
      });

      if (!positionMatches) {
        return NextResponse.json(
          { success: false, error: `Player ${player.name} (${player.position}) does not match round positions (${round.position})` },
          { status: 400 }
        );
      }
    }

    // We proceed to batch delete and insert in a single block
    console.log(`⚡ [Batch Save Bids] Saving ${bids.length} bids for team ${teamId} in round ${roundId}`);

    // Fetch existing bids to compare and only broadcast what's added/removed (to reduce noise)
    const existingBids = await sql`
      SELECT player_id FROM bids
      WHERE team_id = ${teamId} AND round_id = ${roundId} AND status = 'active'
    `;
    const existingPlayerIds = new Set(existingBids.map(b => b.player_id));
    const newPlayerIds = new Set(bids.map(b => b.player_id));

    // Determine changes
    const addedPlayerIds = bids.filter(b => !existingPlayerIds.has(b.player_id)).map(b => b.player_id);
    const removedPlayerIds = Array.from(existingPlayerIds).filter(id => !newPlayerIds.has(id));

    // Clear existing active bids
    await sql`
      DELETE FROM bids
      WHERE team_id = ${teamId}
      AND round_id = ${roundId}
      AND status = 'active'
    `;

    // Bulk insert new bids
    const insertedBids = [];
    for (const bid of bids) {
      const bidId = `${teamId}_${roundId}_${bid.player_id}`;
      const encryptedBidData = encryptBidData({
        player_id: bid.player_id,
        amount: bid.amount
      });

      const insertResult = await sql`
        INSERT INTO bids (
          id, team_id, team_name, player_id, round_id, season_id,
          amount, encrypted_bid_data, status, created_at, updated_at
        ) VALUES (
          ${bidId}, ${teamId}, ${teamName}, ${bid.player_id}, ${roundId}, ${round.season_id},
          NULL, ${encryptedBidData}, 'active', NOW(), NOW()
        )
        RETURNING id, player_id, status
      `;
      insertedBids.push(insertResult[0]);
    }

    // Send single broadcast about bids update
    await broadcastRoundUpdate(round.season_id, roundId, {
      type: 'bids_updated',
      team_id: teamId,
      team_name: teamName,
      round_id: roundId,
      added: addedPlayerIds,
      removed: removedPlayerIds,
      total_bids: bids.length
    });

    return NextResponse.json({
      success: true,
      message: 'Bids saved successfully',
      bids: insertedBids,
    });

  } catch (error: any) {
    console.error('Error batch-saving bids:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
