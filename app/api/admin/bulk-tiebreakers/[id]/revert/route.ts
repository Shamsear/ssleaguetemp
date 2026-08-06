import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { getFirestore } from 'firebase-admin/firestore';
import { broadcastSquadUpdate, broadcastWalletUpdate } from '@/lib/realtime/broadcast';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * POST /api/admin/bulk-tiebreakers/:id/revert
 * Revert a resolved tiebreaker back to active state
 * Committee admin only
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate - uses JWT claims only
    const auth = await verifyAuth(['admin', 'committee', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: tiebreakerId } = await params;
    console.log(`🔄 Reverting resolved bulk tiebreaker: ${tiebreakerId}`);

    // 2. Fetch tiebreaker details
    const tiebreakerResult = await sql`
      SELECT 
        id,
        player_id,
        player_name,
        player_position as position,
        bulk_round_id as round_id,
        current_highest_bid,
        current_highest_team_id,
        status,
        season_id
      FROM bulk_tiebreakers
      WHERE id = ${tiebreakerId}
    `;

    if (tiebreakerResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tiebreaker not found' },
        { status: 404 }
      );
    }

    const tiebreaker = tiebreakerResult[0];

    // Check if the tiebreaker is actually resolved
    if (tiebreaker.status !== 'resolved' && tiebreaker.status !== 'finalized') {
      return NextResponse.json(
        { success: false, error: 'Tiebreaker is not resolved or finalized - cannot revert' },
        { status: 400 }
      );
    }

    const winnerTeamId = tiebreaker.current_highest_team_id;
    const winningAmount = Number(tiebreaker.current_highest_bid || 0);
    const seasonId = tiebreaker.season_id;

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'Season ID not found on tiebreaker' },
        { status: 400 }
      );
    }

    // 3. Roll back Postgres database records
    console.log(`🔄 Reverting Postgres state for player ${tiebreaker.player_id} and team ${winnerTeamId}...`);

    // Reset round_players status back to contested
    await sql`
      UPDATE round_players
      SET 
        winning_team_id = NULL,
        winning_bid = NULL,
        status = 'contested'
      WHERE round_id = ${tiebreaker.round_id}
      AND player_id = ${tiebreaker.player_id}
    `;

    // Reset player details in footballplayers
    await sql`
      UPDATE footballplayers
      SET 
        is_sold = false,
        team_id = NULL,
        acquisition_value = 0,
        status = NULL,
        round_id = NULL,
        contract_start_season = NULL,
        contract_end_season = NULL,
        contract_length = NULL,
        updated_at = NOW()
      WHERE id = ${tiebreaker.player_id}
    `;

    // Remove player assignment from team_players
    await sql`
      DELETE FROM team_players
      WHERE player_id = ${tiebreaker.player_id}
      AND season_id = ${seasonId}
    `;

    // Mark bulk tiebreaker as active
    await sql`
      UPDATE bulk_tiebreakers
      SET 
        status = 'active',
        resolved_at = NULL,
        updated_at = NOW()
      WHERE id = ${tiebreakerId}
    `;

    // Mark corresponding entry in tiebreakers as active
    await sql`
      UPDATE tiebreakers
      SET 
        status = 'active',
        winning_team_id = NULL,
        winning_bid = NULL,
        updated_at = NOW()
      WHERE id = ${tiebreakerId}
    `;

    // Reset winning flag in round_bids
    await sql`
      UPDATE round_bids
      SET is_winning = false
      WHERE round_id = ${tiebreaker.round_id}
      AND player_id = ${tiebreaker.player_id}
    `;

    // Refund team's spending and count in Postgres
    if (winnerTeamId && winningAmount > 0) {
      await sql`
        UPDATE teams
        SET 
          football_spent = GREATEST(0, football_spent - ${winningAmount}),
          football_budget = football_budget + ${winningAmount},
          football_players_count = GREATEST(0, football_players_count - 1),
          updated_at = NOW()
        WHERE id = ${winnerTeamId}
        AND season_id = ${seasonId}
      `;
      console.log(`✅ Refunded Postgres team wallet for team ${winnerTeamId}`);
    }

    // Set round status back to active if it was completed
    await sql`
      UPDATE rounds
      SET 
        status = 'active',
        updated_at = NOW()
      WHERE id = ${tiebreaker.round_id}
      AND status = 'completed'
    `;
    console.log(`✅ Set round ${tiebreaker.round_id} status back to active`);

    // 4. Roll back Firebase/Firestore state
    if (winnerTeamId) {
      // Find team firebase_uid to delete transaction
      const teamFirebaseResult = await sql`
        SELECT firebase_uid FROM teams
        WHERE id = ${winnerTeamId}
        AND season_id = ${seasonId}
        LIMIT 1
      `;
      const firebaseUid = teamFirebaseResult[0]?.firebase_uid;

      if (firebaseUid) {
        try {
          const adminDb = getFirestore();
          const existingTxns = await adminDb.collection('transactions')
            .where('userId', '==', firebaseUid)
            .where('seasonId', '==', seasonId)
            .where('type', '==', 'auction_win')
            .get();

          for (const doc of existingTxns.docs) {
            const metadata = doc.data().metadata || {};
            if (metadata.playerId === tiebreaker.player_id) {
              await doc.ref.delete();
              console.log(`🗑️ Deleted Firebase transaction document ${doc.id} for player ${tiebreaker.player_name}`);
            }
          }
        } catch (fsError) {
          console.error('⚠️ Failed to delete Firebase transaction:', fsError);
        }
      }

      // Refund Firebase team season budget and count
      try {
        const adminDb = getFirestore();
        const teamSeasonId = `${winnerTeamId}_${seasonId}`;
        const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonId);
        const teamSeasonSnap = await teamSeasonRef.get();

        if (teamSeasonSnap.exists) {
          const teamSeasonData = teamSeasonSnap.data();
          const currencySystem = teamSeasonData?.currency_system || 'single';
          const isDualCurrency = currencySystem === 'dual';

          const currentBudget = isDualCurrency
            ? (teamSeasonData?.football_budget || 0)
            : (teamSeasonData?.budget || 0);

          const currentSpent = isDualCurrency
            ? (teamSeasonData?.football_spent || 0)
            : (teamSeasonData?.total_spent || 0);

          const positionCounts = teamSeasonData?.position_counts || {};
          const currentPositionCount = positionCounts[tiebreaker.position] || 0;
          const newPositionCounts = {
            ...positionCounts,
            [tiebreaker.position]: Math.max(0, currentPositionCount - 1)
          };

          const currentPlayersCount = teamSeasonData?.players_count || 0;
          const newPlayersCount = Math.max(0, currentPlayersCount - 1);

          const updateData: any = {
            position_counts: newPositionCounts,
            players_count: newPlayersCount,
            updated_at: new Date()
          };

          if (isDualCurrency) {
            updateData.football_budget = currentBudget + winningAmount;
            updateData.football_spent = Math.max(0, currentSpent - winningAmount);
          } else {
            updateData.budget = currentBudget + winningAmount;
            updateData.total_spent = Math.max(0, currentSpent - winningAmount);
          }

          await teamSeasonRef.update(updateData);
          console.log(`✅ Refunded Firestore budget for ${winnerTeamId} (${currentBudget} -> ${isDualCurrency ? updateData.football_budget : updateData.budget})`);

          // 5. Broadcast real-time updates to squad/wallet
          await broadcastSquadUpdate(seasonId, winnerTeamId, {
            player_id: tiebreaker.player_id,
            player_name: tiebreaker.player_name || 'Unknown Player',
            action: 'released',
            price: winningAmount,
          });

          await broadcastWalletUpdate(seasonId, winnerTeamId, {
            new_balance: isDualCurrency ? updateData.football_budget : updateData.budget,
            amount_spent: -winningAmount,
            currency_type: isDualCurrency ? 'football' : 'single',
          });
          console.log(`📢 Broadcasted real-time releases to team ${winnerTeamId}`);
        }
      } catch (fsError) {
        console.error('⚠️ Failed to update Firestore team season budget:', fsError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Tiebreaker for ${tiebreaker.player_name} reverted successfully.`,
    });

  } catch (error: any) {
    console.error('❌ Error reverting tiebreaker:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to revert tiebreaker' },
      { status: 500 }
    );
  }
}
