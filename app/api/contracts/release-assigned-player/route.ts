import { getMainDb } from '@/lib/neon/main-config';
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

    // 2. Update team budget in Neon Main DB and Firestore based on actual assigned roster
    try {
      const { getMainDb } = await import('@/lib/neon/main-config');
      const mainSql = getMainDb();
      const teamSeasonId = `${teamId}_${seasonId}`;

      let actualSpent = 0;
      if (isModern) {
        const res = await sql`
          SELECT COALESCE(SUM(auction_value::numeric), 0) as total
          FROM player_seasons
          WHERE team_id = ${teamId} AND season_id = ${seasonId}
        `;
        actualSpent = Number(res[0]?.total || 0);
      } else {
        const res = await sql`
          SELECT COALESCE(SUM(price::numeric), 0) as total
          FROM realplayerstats
          WHERE team_id = ${teamId} AND season_id = ${seasonId}
        `;
        actualSpent = Number(res[0]?.total || 0);
      }

      const tsRow = await mainSql`
        SELECT initial_budget, raw_data
        FROM team_seasons
        WHERE (team_id = ${teamId} OR id = ${teamSeasonId}) AND season_id = ${seasonId}
        LIMIT 1
      `;
      const initialBudget = Number(
        tsRow[0]?.raw_data?.initial_real_player_budget ||
        tsRow[0]?.raw_data?.real_player_starting_balance ||
        tsRow[0]?.initial_budget ||
        400
      );
      const actualBudget = initialBudget - actualSpent;

      await mainSql`
        UPDATE team_seasons
        SET real_player_budget = ${actualBudget},
            real_player_spent = ${actualSpent},
            raw_data = jsonb_set(
              jsonb_set(
                COALESCE(raw_data, '{}'::jsonb),
                '{real_player_budget}',
                to_jsonb(${actualBudget}::numeric)
              ),
              '{real_player_spent}',
              to_jsonb(${actualSpent}::numeric)
            ),
            updated_at = NOW()
        WHERE (team_id = ${teamId} OR id = ${teamSeasonId}) AND season_id = ${seasonId}
      `;

      try {
        await adminDb.collection('team_seasons').doc(teamSeasonId).set({
          real_player_budget: actualBudget,
          real_player_spent: actualSpent,
          updated_at: new Date(),
        }, { merge: true });
      } catch (fsErr) {
        console.warn('Error syncing budget to Firestore team_seasons:', fsErr);
      }
    } catch (neonBudgetErr) {
      console.error('[release-assigned-player] Error updating team budget in Neon:', neonBudgetErr);
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
