import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

/**
 * POST /api/contracts/assign-bulk
 * Body: {
 *   seasonId: string,
 *   players: Array<{ id: string, teamId: string, playerName: string, auctionValue: number }>
 * }
 */
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
    const { seasonId, players } = body;

    if (!seasonId || !players || !Array.isArray(players)) {
      return NextResponse.json(
        { error: 'seasonId and players array are required' },
        { status: 400 }
      );
    }

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    const sql = getTournamentDb();

    // Fetch team name mapping from Firestore team_seasons to set human-readable team names
    const teamNameMap = new Map<string, string>();
    try {
      const teamSeasonsSnap = await adminDb.collection('team_seasons')
        .where('season_id', '==', seasonId)
        .get();
      teamSeasonsSnap.docs.forEach(doc => {
        const data = doc.data();
        const tId = data.team_id || doc.id.split('_')[0];
        const tName = data.team_name || data.team_code || 'Unknown Team';
        teamNameMap.set(tId, tName);
      });
    } catch (e) {
      console.error('Error fetching team names from Firestore:', e);
    }

    // Track budget changes per team
    const teamBudgetChanges = new Map<string, number>();

    for (const player of players) {
      const teamName = teamNameMap.get(player.teamId) || 'Unknown Team';

      if (isModern) {
        // S16 / S17: update player_seasons table
        await sql`
          UPDATE player_seasons
          SET team_id = ${player.teamId},
              team = ${teamName},
              auction_value = ${player.auctionValue},
              updated_at = NOW()
          WHERE id = ${player.id}
        `;
      } else {
        // S18+: update realplayerstats table
        await sql`
          UPDATE realplayerstats
          SET team_id = ${player.teamId},
              team = ${teamName},
              price = ${player.auctionValue},
              updated_at = NOW()
          WHERE id = ${player.id}
        `;
      }

      // Track budget change for this team
      const currentChange = teamBudgetChanges.get(player.teamId) || 0;
      teamBudgetChanges.set(player.teamId, currentChange + player.auctionValue);
    }

    // Update team budgets in Firestore
    for (const [teamId, totalSpent] of teamBudgetChanges.entries()) {
      try {
        const teamSeasonId = `${teamId}_${seasonId}`;
        const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonId);
        const teamSeasonDoc = await teamSeasonRef.get();

        if (teamSeasonDoc.exists) {
          const data = teamSeasonDoc.data()!;
          const currentBudget = data.real_player_budget || 1000;
          const currentSpent = data.real_player_spent || 0;

          await teamSeasonRef.update({
            real_player_budget: currentBudget - totalSpent,
            real_player_spent: currentSpent + totalSpent,
            updated_at: new Date(),
          });

          console.log(`[assign-bulk] Updated team ${teamId}: spent ${totalSpent}, new budget: ${currentBudget - totalSpent}`);
        }
      } catch (error) {
        console.error(`[assign-bulk] Error updating budget for team ${teamId}:`, error);
      }
    }

    // Create transactions and notifications for each player assignment
    for (const player of players) {
      try {
        const teamName = teamNameMap.get(player.teamId) || 'Unknown Team';
        const transactionId = `${player.teamId}_${seasonId}_${player.id}_${Date.now()}`;
        
        // Create transaction record
        await adminDb.collection('transactions').doc(transactionId).set({
          team_id: player.teamId,
          team_name: teamName,
          season_id: seasonId,
          player_id: player.id,
          player_name: player.playerName,
          transaction_type: 'player_assignment',
          amount: player.auctionValue,
          currency_type: 'real_player',
          description: `${player.playerName} assigned to ${teamName} for ${player.auctionValue} coins`,
          created_at: new Date(),
          created_by: auth.userId || 'system',
        });

        // Create notification for team
        const notificationId = `${player.teamId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await adminDb.collection('notifications').doc(notificationId).set({
          team_id: player.teamId,
          season_id: seasonId,
          type: 'player_assignment',
          title: 'New Player Assigned',
          message: `${player.playerName} has been assigned to your team for ${player.auctionValue} coins`,
          read: false,
          created_at: new Date(),
          data: {
            player_id: player.id,
            player_name: player.playerName,
            auction_value: player.auctionValue,
            team_name: teamName,
          }
        });

        console.log(`[assign-bulk] Created transaction and notification for ${player.playerName}`);
      } catch (error) {
        console.error(`[assign-bulk] Error creating transaction/notification for player ${player.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Assigned ${players.length} players to their teams successfully.`
    });
  } catch (error: any) {
    console.error('[assign-bulk] Error assigning players:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to assign players' },
      { status: 500 }
    );
  }
}
