import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * GET /api/admin/database/balance-audit
 * Audits all team balances and player counts in Season SSPSLS18
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Default to season SSPSLS18 if not specified
    const url = new URL(request.url);
    const seasonId = url.searchParams.get('season_id') || 'SSPSLS18';

    // 1. Fetch Postgres teams
    const pgTeams = await sql`
      SELECT id, name, football_budget, football_spent, football_players_count
      FROM teams
      WHERE season_id = ${seasonId}
      ORDER BY name ASC
    `;

    const auditResults = [];

    for (const team of pgTeams) {
      // Get players from footballplayers table
      const players = await sql`
        SELECT id, name, position, acquisition_value
        FROM footballplayers
        WHERE team_id = ${team.id} AND is_sold = true AND round_id IN (
          SELECT id FROM rounds WHERE season_id = ${seasonId}
        )
      `;

      const pgSquadCount = players.length;
      const pgActualSpent = players.reduce((sum, p) => sum + Number(p.acquisition_value || 0), 0);
      const expectedBudget = 10000 - pgActualSpent;

      // Get Firebase document
      const tsId = `${team.id}_${seasonId}`;
      const tsDoc = await adminDb.collection('team_seasons').doc(tsId).get();
      let fsData = null;
      if (tsDoc.exists) {
        fsData = tsDoc.data();
      }

      const fbCount = fsData ? fsData.players_count : 0;
      const fbSpent = fsData ? (fsData.currency_system === 'dual' ? fsData.football_spent : fsData.total_spent) : 0;
      const fbBudget = fsData ? (fsData.currency_system === 'dual' ? fsData.football_budget : fsData.budget) : 0;

      const countMismatch = (pgSquadCount !== Number(team.football_players_count)) || (pgSquadCount !== fbCount);
      const spentMismatch = (pgActualSpent !== Number(team.football_spent)) || (pgActualSpent !== Number(fbSpent));
      const budgetMismatch = (expectedBudget !== Number(team.football_budget)) || (expectedBudget !== Number(fbBudget));

      auditResults.push({
        team_id: team.id,
        team_name: team.name,
        pg_squad_count: pgSquadCount,
        pg_cached_count: Number(team.football_players_count),
        fb_count: fbCount,
        pg_actual_spent: pgActualSpent,
        pg_cached_spent: Number(team.football_spent),
        fb_spent: Number(fbSpent),
        pg_budget: Number(team.football_budget),
        fb_budget: Number(fbBudget),
        expected_budget: expectedBudget,
        mismatch: countMismatch || spentMismatch || budgetMismatch,
        players: players.map((p: any) => ({
          name: p.name,
          position: p.position,
          value: Number(p.acquisition_value || 0)
        }))
      });
    }

    return NextResponse.json({
      success: true,
      seasonId,
      audit: auditResults
    });
  } catch (error: any) {
    console.error('[Balance Audit] Error performing audit:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/database/balance-audit
 * Corrects and syncs all team balances and player counts to match actual squads
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const seasonId = body.season_id || 'SSPSLS18';
    const targetTeamId = body.team_id; // Optional: target single team

    // Fetch Season Info to check if it has transitioned to mid-season
    const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
    const seasonData = seasonDoc.exists ? seasonDoc.data() : null;
    const isMidSeason = seasonData?.is_mid_season === true;

    // Fetch Postgres teams
    let pgTeams = [];
    if (targetTeamId) {
      pgTeams = await sql`
        SELECT id, name
        FROM teams
        WHERE id = ${targetTeamId} AND season_id = ${seasonId}
      `;
    } else {
      pgTeams = await sql`
        SELECT id, name
        FROM teams
        WHERE season_id = ${seasonId}
      `;
    }

    let updatedCount = 0;

    for (const team of pgTeams) {
      // 1. Get true squad list
      const players = await sql`
        SELECT id, name, position, acquisition_value
        FROM footballplayers
        WHERE team_id = ${team.id} AND is_sold = true AND round_id IN (
          SELECT id FROM rounds WHERE season_id = ${seasonId}
        )
      `;

      const actualPlayersCount = players.length;
      let actualSumSpent = players.reduce((sum, p) => sum + Number(p.acquisition_value || 0), 0);
      let actualBudget = 10000 - actualSumSpent;

      if (isMidSeason) {
        // Query all transactions for this team in Firestore and filter in-memory to prevent index errors
        const allTeamTxsSnap = await adminDb.collection('transactions')
          .where('team_id', '==', team.id)
          .get();

        const txs = allTeamTxsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() as any }))
          .filter((tx: any) => 
            tx.season_id === seasonId && 
            tx.currency_type === 'football'
          );

        const getTxTime = (tx: any) => {
          if (!tx.created_at) return 0;
          if (typeof tx.created_at.toDate === 'function') return tx.created_at.toDate().getTime();
          if (tx.created_at instanceof Date) return tx.created_at.getTime();
          return new Date(tx.created_at).getTime();
        };

        // Sort descending
        txs.sort((a, b) => getTxTime(b) - getTxTime(a));

        const resetTx = txs.find((tx: any) => 
          tx.transaction_type === 'adjustment' && 
          tx.description === 'Mid-season budget reset to 0'
        );

        if (resetTx) {
          const resetTime = getTxTime(resetTx);
          const postResetTxs = txs.filter((tx: any) => getTxTime(tx) > resetTime);

          let midSeasonBalance = 0;
          let midSeasonSpent = 0;
          for (const tx of postResetTxs) {
            midSeasonBalance += tx.amount || 0;
            if (tx.amount < 0) {
              midSeasonSpent += Math.abs(tx.amount);
            }
          }
          actualBudget = midSeasonBalance;
          actualSumSpent = midSeasonSpent;
        } else {
          // If no reset transaction is found, fall back to 0
          actualBudget = 0;
          actualSumSpent = 0;
        }
      }

      // Recalculate position counts
      const positionCounts: Record<string, number> = {};
      players.forEach((p: any) => {
        if (p.position) {
          positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        }
      });

      // 2. Update Postgres teams
      await sql`
        UPDATE teams
        SET football_spent = ${actualSumSpent},
            football_budget = ${actualBudget},
            football_players_count = ${actualPlayersCount},
            updated_at = NOW()
        WHERE id = ${team.id} AND season_id = ${seasonId}
      `;

      // 3. Update Firebase team_seasons
      const tsId = `${team.id}_${seasonId}`;
      const tsRef = adminDb.collection('team_seasons').doc(tsId);
      const tsDoc = await tsRef.get();

      if (tsDoc.exists) {
        const tsd = tsDoc.data();
        const curr = tsd?.currency_system || 'single';

        const upd: any = {
          total_spent: actualSumSpent,
          players_count: actualPlayersCount,
          position_counts: positionCounts,
          updated_at: new Date()
        };

        if (curr === 'dual') {
          upd.football_budget = actualBudget;
          upd.football_spent = actualSumSpent;
        } else {
          upd.budget = actualBudget;
        }

        await tsRef.update(upd);
      }
      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized and corrected balances for ${updatedCount} team(s).`
    });
  } catch (error: any) {
    console.error('[Balance Audit] Error performing correction:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
