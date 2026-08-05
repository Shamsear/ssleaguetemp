import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { adminDb } from '@/lib/firebase/admin';
import { decryptBidData } from '@/lib/encryption';
import { broadcastRoundUpdate } from '@/lib/realtime/broadcast';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * POST /api/admin/rounds/[id]/revert
 * Revert a completed round finalization (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(['admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: roundId } = await params;

    let extendMinutes = 0;
    try {
      const body = await request.json();
      extendMinutes = Number(body.extendMinutes) || 0;
    } catch (e) {
      console.log('[Revert Round] No request body or failed to parse body');
    }

    // 1. Get round details
    const roundResult = await sql`
      SELECT id, season_id, status, position, round_number
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
    const seasonId = round.season_id;

    if (round.status !== 'completed' && round.status !== 'tiebreaker_pending' && round.status !== 'finalizing') {
      return NextResponse.json(
        { success: false, error: 'Round must be completed or finalizing to revert' },
        { status: 400 }
      );
    }

    console.log(`[Revert Round] Reverting finalization for round ${roundId}`);

    // 2. Get resolved tiebreakers for this round
    const resolvedTiebreakers = await sql`
      SELECT player_id, winning_team_id
      FROM tiebreakers
      WHERE round_id = ${roundId} AND status = 'resolved'
    `;

    // 3. Get all allocations currently in team_players for this round
    const allocations = await sql`
      SELECT team_id, player_id, purchase_price
      FROM team_players
      WHERE round_id = ${roundId}
    `;

    let revertedCount = 0;

    for (const alloc of allocations) {
      const isTiebreakerWinner = resolvedTiebreakers.some(
        tb => tb.player_id === alloc.player_id && tb.winning_team_id === alloc.team_id
      );

      if (isTiebreakerWinner) {
        continue;
      }

      // A. Delete from team_players
      await sql`
        DELETE FROM team_players
        WHERE round_id = ${roundId} AND player_id = ${alloc.player_id} AND team_id = ${alloc.team_id}
      `;

      // B. Update footballplayers: set is_sold = false, team_id = null, etc.
      await sql`
        UPDATE footballplayers
        SET is_sold = false,
            team_id = null,
            acquisition_value = null,
            round_id = null,
            status = null,
            contract_start_season = null,
            contract_end_season = null,
            contract_length = null,
            updated_at = NOW()
        WHERE id = ${alloc.player_id}
      `;

      // C. Update Postgres teams: subtract spent, add budget, decrement count
      await sql`
        UPDATE teams
        SET football_spent = football_spent - ${alloc.purchase_price},
            football_budget = football_budget + ${alloc.purchase_price},
            football_players_count = football_players_count - 1,
            updated_at = NOW()
        WHERE id = ${alloc.team_id} AND season_id = ${seasonId}
      `;

      // D. Update Firebase team_seasons
      const tsId = `${alloc.team_id}_${seasonId}`;
      const tsRef = adminDb.collection('team_seasons').doc(tsId);
      const tsDoc = await tsRef.get();
      if (tsDoc.exists) {
        const tsd = tsDoc.data();
        const curr = tsd?.currency_system || 'single';
        const positionCounts = tsd?.position_counts || {};

        // Find the player's position to decrement the count
        const playerRes = await sql`SELECT position FROM footballplayers WHERE id = ${alloc.player_id}`;
        const pos = playerRes[0]?.position;
        if (pos && pos in positionCounts) {
          positionCounts[pos] = Math.max(0, (positionCounts[pos] || 1) - 1);
        }

        const upd: any = {
          total_spent: Math.max(0, (tsd?.total_spent || 0) - alloc.purchase_price),
          players_count: Math.max(0, (tsd?.players_count || 1) - 1),
          position_counts: positionCounts,
          updated_at: new Date()
        };

        if (curr === 'dual') {
          upd.football_budget = (tsd?.football_budget || 0) + alloc.purchase_price;
          upd.football_spent = Math.max(0, (tsd?.football_spent || 0) - alloc.purchase_price);
        } else {
          upd.budget = (tsd?.budget || 0) + alloc.purchase_price;
        }

        await tsRef.update(upd);
      }

      revertedCount++;
    }

    // 3.5. Revert Transaction Logs in Firestore
    const txSnapshot = await adminDb.collection('transactions')
      .where('metadata.round_id', '==', roundId)
      .where('transaction_type', '==', 'auction_win')
      .get();

    for (const doc of txSnapshot.docs) {
      const txData = doc.data();
      const pId = txData.metadata?.player_id;
      const tId = txData.team_id;

      const isTiebreakerWinner = resolvedTiebreakers.some(
        tb => tb.player_id === pId && tb.winning_team_id === tId
      );

      if (!isTiebreakerWinner) {
        await doc.ref.delete();
      }
    }

    // 4. Revert Bids in Postgres
    const bidsResult = await sql`
      SELECT id, team_id, encrypted_bid_data
      FROM bids
      WHERE round_id = ${roundId}
    `;

    for (const bid of bidsResult) {
      let playerId = '';
      try {
        const decrypted = decryptBidData(bid.encrypted_bid_data);
        playerId = decrypted.player_id;
      } catch {}

      const isTiebreakerWinner = resolvedTiebreakers.some(
        tb => tb.player_id === playerId && tb.winning_team_id === bid.team_id
      );

      if (isTiebreakerWinner) {
        await sql`
          UPDATE bids
          SET status = 'won', updated_at = NOW()
          WHERE id = ${bid.id}
        `;
      } else {
        await sql`
          UPDATE bids
          SET status = 'active', actual_bid_amount = null, phase = null, updated_at = NOW()
          WHERE id = ${bid.id}
        `;
      }
    }

    // 5. Update round status back to 'expired' or 'active' depending on deadline extension
    let finalStatus = 'expired';
    let newEndTime = null;

    if (extendMinutes > 0) {
      finalStatus = 'active';
      newEndTime = new Date(Date.now() + extendMinutes * 60 * 1000);
    }

    if (newEndTime) {
      await sql`
        UPDATE rounds
        SET status = ${finalStatus},
            end_time = ${newEndTime.toISOString()},
            updated_at = NOW()
        WHERE id = ${roundId}
      `;
    } else {
      await sql`
        UPDATE rounds
        SET status = ${finalStatus},
            updated_at = NOW()
        WHERE id = ${roundId}
      `;
    }

    // 6. Broadcast round update to Firebase for real-time dashboard sync
    await broadcastRoundUpdate(seasonId, roundId, {
      type: 'round_status_changed',
      status: finalStatus,
      ...(newEndTime && { end_time: newEndTime.toISOString() }),
    });

    return NextResponse.json({
      success: true,
      message: `Round finalization reverted successfully. Reverted ${revertedCount} allocations.`,
    });
  } catch (error: any) {
    console.error('[Revert Round] Error reverting round finalization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
