import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuth } from '@/lib/auth-helper';
import { getAuctionDb } from '@/lib/neon/auction-config';
import { logTransaction } from '@/lib/transaction-logger';

/**
 * POST /api/admin/seasons/[id]/transition-mid-season
 * Resets all team budgets to 0 and transitions season to mid-season phase.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verify admin permissions
    const auth = await verifyAuth(['admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: seasonId } = await params;

    // 2. Fetch Season Document from Firestore
    const seasonRef = adminDb.collection('seasons').doc(seasonId);
    const seasonSnap = await seasonRef.get();

    if (!seasonSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Season not found' },
        { status: 404 }
      );
    }

    const seasonData = seasonSnap.data()!;
    if (seasonData.is_mid_season) {
      return NextResponse.json(
        { success: false, error: 'Season has already transitioned to mid-season' },
        { status: 400 }
      );
    }

    // 3. Get all team_seasons for this season
    const teamSeasonsSnap = await adminDb
      .collection('team_seasons')
      .where('season_id', '==', seasonId)
      .get();

    const sql = getAuctionDb();
    const batch = adminDb.batch();
    const processedTeams: string[] = [];

    // 4. Update each team's budget and log transaction
    for (const doc of teamSeasonsSnap.docs) {
      const teamSeasonData = doc.data();
      const teamId = teamSeasonData.team_id;
      const currencySystem = teamSeasonData.currency_system || 'single';
      const isDualCurrency = currencySystem === 'dual';

      const currentBudget = isDualCurrency 
        ? (teamSeasonData.football_budget || 0)
        : (teamSeasonData.budget || 0);

      // Log the adjustment transaction to Firestore
      await logTransaction({
        team_id: teamId,
        season_id: seasonId,
        transaction_type: 'adjustment',
        currency_type: 'football',
        amount: -currentBudget,
        balance_before: currentBudget,
        balance_after: 0,
        description: 'Mid-season budget reset to 0',
        metadata: {
          processed_by: auth.userId,
          processed_by_name: 'Committee Admin'
        }
      });

      // Update Firestore team_seasons document in batch
      const docUpdates: any = {
        updated_at: new Date()
      };

      if (isDualCurrency) {
        docUpdates.football_budget = 0;
        docUpdates.football_spent = 0;
      } else {
        docUpdates.budget = 0;
        docUpdates.total_spent = 0;
      }

      batch.update(doc.ref, docUpdates);

      // Update Neon Postgres team records
      if (isDualCurrency) {
        await sql`
          UPDATE teams
          SET football_budget = 0,
              football_spent = 0,
              updated_at = NOW()
          WHERE id = ${teamId} AND season_id = ${seasonId}
        `;
      } else {
        await sql`
          UPDATE teams
          SET football_budget = 0,
              football_spent = 0,
              updated_at = NOW()
          WHERE id = ${teamId} AND season_id = ${seasonId}
        `;
      }

      processedTeams.push(teamSeasonData.team_name || teamId);
    }

    // 5. Update season document to reflect transition
    batch.update(seasonRef, {
      is_mid_season: true,
      mid_season_reset_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    // Commit Firestore batch updates
    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Successfully transitioned season to mid-season. Reset budgets for ${processedTeams.length} teams.`,
      data: {
        season_id: seasonId,
        teams_processed: processedTeams
      }
    });

  } catch (error: any) {
    console.error('Error transitioning season to mid-season:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
