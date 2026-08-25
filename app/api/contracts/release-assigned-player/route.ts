import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { seasonId, playerId, teamId, refundAmount } = body;

    if (!seasonId || !playerId || !teamId || refundAmount === undefined) {
      return NextResponse.json(
        { error: 'seasonId, playerId, teamId, and refundAmount are required' },
        { status: 400 }
      );
    }

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    const sql = getTournamentDb();

    // 1. Database SQL Update: reset team and price/value fields
    if (isModern) {
      await sql`
        UPDATE player_seasons
        SET team_id = NULL,
            team = NULL,
            auction_value = NULL,
            updated_at = NOW()
        WHERE id = ${playerId} AND season_id = ${seasonId}
      `;
    } else {
      await sql`
        UPDATE realplayerstats
        SET team_id = NULL,
            team = NULL,
            price = 0,
            updated_at = NOW()
        WHERE id = ${playerId} AND season_id = ${seasonId}
      `;
    }

    // 2. Fetch Team participate settings and update the team budget in Firestore
    const teamSeasonId = `${teamId}_${seasonId}`;
    const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonId);
    const teamSeasonDoc = await teamSeasonRef.get();

    if (teamSeasonDoc.exists) {
      const data = teamSeasonDoc.data() || {};
      const currentBudget = data.real_player_budget || 0;
      const currentSpent = data.real_player_spent || 0;

      await teamSeasonRef.update({
        real_player_budget: currentBudget + Number(refundAmount),
        real_player_spent: Math.max(0, currentSpent - Number(refundAmount)),
        updated_at: new Date(),
      });
    }

    // 3. Find and delete the original player assignment transaction
    try {
      const transactionsRef = adminDb.collection('transactions');
      const q = transactionsRef
        .where('season_id', '==', seasonId)
        .where('team_id', '==', teamId)
        .where('player_id', '==', playerId)
        .where('transaction_type', '==', 'player_assignment');

      const querySnapshot = await q.get();
      const deletePromises = querySnapshot.docs.map(doc => doc.ref.delete());
      await Promise.all(deletePromises);
      console.log(`[release-assigned-player] Deleted ${deletePromises.length} matching assignment transactions`);
    } catch (txError) {
      console.error('[release-assigned-player] Error deleting original transaction:', txError);
      // Continue even if transaction deletion fails
    }

    return NextResponse.json({
      success: true,
      message: 'Player assignment reversed successfully and budget refunded.'
    });

  } catch (error: any) {
    console.error('[release-assigned-player] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to release player assignment' },
      { status: 500 }
    );
  }
}
