import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { getAuctionDb } from '@/lib/neon/auction-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { encryptBidData, decryptBidData } from '@/lib/encryption';
import { calculateReserve } from '@/lib/reserve-calculator';
import { broadcastRoundUpdate } from '@/lib/realtime/broadcast';

/**
 * GET /api/admin/rounds/[id]/teams/[teamId]/proxy-bids
 * Fetch round info, team details, eligible players pool, and any existing bids for this team.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const auth = await verifyAuth(['admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: roundId, teamId } = await params;
    const sql = getAuctionDb();

    // 1. Get round details
    const roundResult = await sql`
      SELECT id, round_number, position, position_group, round_type, status,
             max_bids_per_team, base_price, season_id, start_time, end_time
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

    // 2. Get team details
    const teamResult = await sql`
      SELECT id, name, football_budget, football_spent, football_players_count,
             football_total_slots, football_base_slots, season_id
      FROM teams
      WHERE id = ${teamId} AND season_id = ${round.season_id}
    `;

    if (teamResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Team not found for this season' },
        { status: 404 }
      );
    }
    const team = teamResult[0];

    // Get Firestore team_season budget for consistency
    let teamBalance = Number(team.football_budget || 0);
    try {
      const tsDoc = await adminDb.collection('team_seasons').doc(`${teamId}_${round.season_id}`).get();
      if (tsDoc.exists) {
        const tsd = tsDoc.data();
        const curr = tsd?.currency_system || 'single';
        teamBalance = curr === 'dual' ? Number(tsd?.football_budget || teamBalance) : Number(tsd?.budget || teamBalance);
      }
    } catch (e) {
      console.warn('Could not read Firestore team_season balance:', e);
    }

    // 3. Calculate reserve info
    let reserveInfo = { minimumReserve: 0, requiresReserve: false, explanation: '' };
    try {
      const res = await calculateReserve(teamId, round.id, round.season_id);
      reserveInfo = {
        minimumReserve: res.minimumReserve || 0,
        requiresReserve: !!res.requiresReserve,
        explanation: res.explanation || '',
      };
    } catch (e) {
      console.warn('Could not calculate reserve:', e);
    }

    // 4. Get available eligible players for this round
    const positions = (round.position || '').split(',').map((p: string) => p.trim());
    const roundSeasonNum = parseInt(round.season_id?.replace(/\D/g, '') || '19', 10);

    const availablePlayers = await sql`
      SELECT 
        p.id,
        p.player_id,
        p.name,
        p.position,
        p.position_group,
        p.overall_rating,
        p.playing_style,
        p.club,
        p.nationality
      FROM footballplayers p
      WHERE (p.position = ANY(${positions}) OR p.position_group = ANY(${positions}))
      AND p.is_auction_eligible = true
      AND (p.retired IS NOT TRUE)
      AND (
        (p.is_sold = false OR p.is_sold IS NULL)
        OR (p.team_id IS NULL OR p.team_id = '')
        OR (p.season_id IS DISTINCT FROM ${round.season_id} AND COALESCE(NULLIF(REGEXP_REPLACE(p.contract_end_season, '[^0-9]', '', 'g'), ''), '0')::int < ${roundSeasonNum})
      )
      ORDER BY p.overall_rating DESC, p.name ASC
    `;

    // 5. Get current bids for this team (if any)
    const existingBids = await sql`
      SELECT b.id, b.player_id, b.amount, b.encrypted_bid_data, b.status,
             p.name as player_name, p.position as player_position, p.overall_rating
      FROM bids b
      LEFT JOIN footballplayers p ON p.id = b.player_id
      WHERE b.team_id = ${teamId} AND b.round_id = ${roundId}
      ORDER BY b.id ASC
    `;

    const decryptedBids = existingBids.map((b: any) => {
      let decAmount = b.amount;
      if (!decAmount && b.encrypted_bid_data) {
        try {
          const dec = decryptBidData(b.encrypted_bid_data);
          decAmount = dec.amount;
        } catch {}
      }
      return {
        id: b.id,
        player_id: b.player_id,
        player_name: b.player_name,
        player_position: b.player_position,
        overall_rating: b.overall_rating,
        amount: decAmount,
        status: b.status,
      };
    });

    // 6. Check submission status
    const subCheck = await sql`
      SELECT is_locked, submitted_at, bid_count
      FROM bid_submissions
      WHERE team_id = ${teamId} AND round_id = ${roundId}
    `;
    const isLocked = subCheck.length > 0 ? !!subCheck[0].is_locked : false;
    const submittedAt = subCheck[0]?.submitted_at || null;

    return NextResponse.json({
      success: true,
      round: {
        id: round.id,
        round_number: round.round_number,
        position: round.position,
        round_type: round.round_type,
        max_bids_per_team: round.max_bids_per_team,
        base_price: round.base_price,
        status: round.status,
        season_id: round.season_id,
      },
      team: {
        id: team.id,
        name: team.name,
        budget: teamBalance,
        spent: Number(team.football_spent || 0),
        players_count: Number(team.football_players_count || 0),
        total_slots: Number(team.football_total_slots || 28),
      },
      reserveInfo,
      availablePlayers,
      currentBids: decryptedBids,
      isLocked,
      submittedAt,
    });
  } catch (error: any) {
    console.error('Error fetching proxy bid data:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/rounds/[id]/teams/[teamId]/proxy-bids
 * Save and/or Submit proxy bids for a team (committee admin only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const auth = await verifyAuth(['admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: roundId, teamId } = await params;
    const body = await request.json();
    const { bids, action = 'submit' } = body; // action: 'submit' | 'draft'

    if (!Array.isArray(bids) || bids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'bids must be a non-empty array' },
        { status: 400 }
      );
    }

    const sql = getAuctionDb();

    // 1. Get round details
    const roundResult = await sql`
      SELECT id, round_number, position, position_group, round_type, status,
             max_bids_per_team, base_price, season_id, start_time, end_time
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

    // If action is submit, validate exact bids count
    if (action === 'submit' && bids.length !== round.max_bids_per_team) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Exactly ${round.max_bids_per_team} bids required to submit. You provided ${bids.length}.` 
        },
        { status: 400 }
      );
    }

    if (bids.length > round.max_bids_per_team) {
      return NextResponse.json(
        { success: false, error: `Maximum ${round.max_bids_per_team} bids allowed.` },
        { status: 400 }
      );
    }

    // 2. Get team details
    const teamResult = await sql`
      SELECT id, name, football_budget, football_spent, football_players_count, season_id
      FROM teams
      WHERE id = ${teamId} AND season_id = ${round.season_id}
    `;

    if (teamResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }
    const team = teamResult[0];
    const teamName = team.name || 'Team';

    // Get team balance
    let teamBalance = Number(team.football_budget || 0);
    try {
      const tsDoc = await adminDb.collection('team_seasons').doc(`${teamId}_${round.season_id}`).get();
      if (tsDoc.exists) {
        const tsd = tsDoc.data();
        const curr = tsd?.currency_system || 'single';
        teamBalance = curr === 'dual' ? Number(tsd?.football_budget || teamBalance) : Number(tsd?.budget || teamBalance);
      }
    } catch (e) {
      console.warn('Could not read Firestore team_season balance:', e);
    }

    // 3. Validate unique amounts & minimum
    const amountsSet = new Set<number>();
    const minBid = Number(round.base_price) || 10;

    for (const b of bids) {
      const amount = Number(b.amount);
      if (isNaN(amount) || amount < minBid) {
        return NextResponse.json(
          { success: false, error: `Bid amount £${b.amount} is invalid. Minimum bid is £${minBid}.` },
          { status: 400 }
        );
      }

      if (amountsSet.has(amount)) {
        return NextResponse.json(
          { success: false, error: `Duplicate bid amount detected: £${amount}. Each bid must have a unique amount.` },
          { status: 400 }
        );
      }
      amountsSet.add(amount);

      if (amount > teamBalance) {
        return NextResponse.json(
          { success: false, error: `Bid of £${amount} exceeds team available budget of £${teamBalance}.` },
          { status: 400 }
        );
      }
    }

    // 4. Validate Reserve requirement
    try {
      const reserve = await calculateReserve(teamId, round.id, round.season_id);
      if ((reserve.phase === 'phase_2' && reserve.minimumReserve > 0) || reserve.requiresReserve) {
        const availableForBid = teamBalance - reserve.minimumReserve;
        for (const b of bids) {
          if (Number(b.amount) > availableForBid) {
            return NextResponse.json(
              {
                success: false,
                error: `Bid of £${b.amount} exceeds reserve limit. Team must maintain £${reserve.minimumReserve} (${reserve.explanation}). Max allowed bid: £${Math.max(0, availableForBid)}.`
              },
              { status: 400 }
            );
          }
        }
      }
    } catch (e) {
      console.warn('Reserve check skipped:', e);
    }

    // 5. Verify players exist and match round positions
    const positions = (round.position || '').split(',').map((p: string) => p.trim());
    const roundSeasonNum = parseInt(round.season_id?.replace(/\D/g, '') || '19', 10);

    for (const b of bids) {
      const pRes = await sql`
        SELECT id, name, position, position_group, is_auction_eligible, is_sold, team_id, retired, season_id, contract_end_season
        FROM footballplayers
        WHERE id = ${b.player_id}
      `;

      if (pRes.length === 0) {
        return NextResponse.json(
          { success: false, error: `Player ID ${b.player_id} not found.` },
          { status: 404 }
        );
      }

      const p = pRes[0];
      if (p.retired) {
        return NextResponse.json(
          { success: false, error: `Player ${p.name} is retired.` },
          { status: 400 }
        );
      }

      if (!p.is_auction_eligible) {
        return NextResponse.json(
          { success: false, error: `Player ${p.name} is not auction eligible.` },
          { status: 400 }
        );
      }

      const playerContractEndNum = parseInt(p.contract_end_season?.replace(/\D/g, '') || '0', 10);
      const isPlayerSold = (p.is_sold || (p.team_id && p.team_id !== '')) &&
        (p.season_id === round.season_id || playerContractEndNum >= roundSeasonNum);

      if (isPlayerSold) {
        return NextResponse.json(
          { success: false, error: `Player ${p.name} is already assigned to a team.` },
          { status: 400 }
        );
      }

      const positionMatches = positions.some((pos: string) => {
        const isGroup = /^[A-Z]+-\d+$/.test(pos);
        return isGroup ? p.position_group === pos : p.position === pos;
      });

      if (!positionMatches) {
        return NextResponse.json(
          { success: false, error: `Player ${p.name} (${p.position}) does not match round position (${round.position}).` },
          { status: 400 }
        );
      }
    }

    // 6. Delete old active bids for this team in this round
    await sql`
      DELETE FROM bids
      WHERE team_id = ${teamId} AND round_id = ${roundId}
    `;

    // 7. Insert new encrypted bids
    for (const b of bids) {
      const bidId = `${teamId}_${roundId}_${b.player_id}`;
      const amount = Number(b.amount);
      const encryptedBidData = encryptBidData({
        player_id: String(b.player_id),
        amount,
      });

      await sql`
        INSERT INTO bids (
          id, team_id, team_name, player_id, round_id, season_id,
          amount, encrypted_bid_data, status, created_at, updated_at
        ) VALUES (
          ${bidId}, ${teamId}, ${teamName}, ${b.player_id}, ${roundId}, ${round.season_id},
          NULL, ${encryptedBidData}, 'active', NOW(), NOW()
        )
      `;
    }

    // 8. Update submission record based on action
    if (action === 'submit') {
      await sql`
        INSERT INTO bid_submissions (
          team_id, round_id, bid_count, is_locked, submitted_at, updated_at
        ) VALUES (
          ${teamId}, ${roundId}, ${bids.length}, true, NOW(), NOW()
        )
        ON CONFLICT (team_id, round_id) DO UPDATE SET
          bid_count = ${bids.length},
          is_locked = true,
          submitted_at = NOW(),
          updated_at = NOW()
      `;
    } else {
      // Revert to draft: Delete lock
      await sql`
        DELETE FROM bid_submissions
        WHERE team_id = ${teamId} AND round_id = ${roundId}
      `;
    }

    // 9. Broadcast realtime update
    await broadcastRoundUpdate(round.season_id, roundId, {
      type: 'bids_updated',
      team_id: teamId,
      team_name: teamName,
      round_id: roundId,
      total_bids: bids.length,
      action: action === 'submit' ? 'proxy_submitted' : 'proxy_draft_saved',
    });

    return NextResponse.json({
      success: true,
      message: action === 'submit'
        ? `Successfully saved and submitted ${bids.length} bids for ${teamName}.`
        : `Successfully saved ${bids.length} draft bids for ${teamName}.`,
      total_bids: bids.length,
      is_locked: action === 'submit',
    });
  } catch (error: any) {
    console.error('Error submitting proxy bids:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
