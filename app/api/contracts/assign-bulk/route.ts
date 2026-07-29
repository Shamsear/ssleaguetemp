import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/send-notification';

/**
 * POST /api/contracts/assign-bulk
 * Body: {
 *   seasonId: string,
 *   players: Array<{ id: string, teamId: string, playerName: string, auctionValue: number }>
 * }
 * 
 * OPTIMIZED FOR SPEED:
 * - Parallel database operations
 * - Batched Firestore writes
 * - Minimal sequential operations
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

    // Validate category quotas for S18+
    if (!isModern && players.length > 0) {
      try {
        const incomingByTeam = new Map<string, Array<{ id: string; name: string }>>();
        for (const p of players) {
          if (!incomingByTeam.has(p.teamId)) {
            incomingByTeam.set(p.teamId, []);
          }
          incomingByTeam.get(p.teamId)!.push({ id: p.id, name: p.playerName });
        }

        const incomingIds = players.map(p => p.id);
        const incomingPlayerDetails = await sql`
          SELECT id, category, player_name
          FROM realplayerstats
          WHERE id IN (${incomingIds}) AND season_id = ${seasonId}
        `;

        const categoryMap = new Map<string, string>();
        incomingPlayerDetails.forEach((row: any) => {
          categoryMap.set(row.id, row.category || 'classic');
        });

        for (const [teamId, incomingPlayers] of incomingByTeam.entries()) {
          const currentAssigned = await sql`
            SELECT id, category, player_name
            FROM realplayerstats
            WHERE team_id = ${teamId} AND season_id = ${seasonId}
          `;

          const projectedPlayers = currentAssigned.filter((p: any) => !incomingIds.includes(p.id));

          for (const inc of incomingPlayers) {
            projectedPlayers.push({
              id: inc.id,
              player_name: inc.name,
              category: categoryMap.get(inc.id) || 'classic'
            });
          }

          const c1 = projectedPlayers.filter((p: any) => p.category === '1st').length;
          const c2 = projectedPlayers.filter((p: any) => p.category === '2nd').length;
          const c3 = projectedPlayers.filter((p: any) => p.category === '3rd').length;
          const c4 = projectedPlayers.filter((p: any) => p.category === '4th').length;

          const max1 = 2;
          const max2 = 1;
          const max3 = 1;
          const max4 = 1;

          if (c1 > max1) {
            return NextResponse.json(
              { error: `Assignment failed. Team would exceed category limit. (1st category: ${c1}/${max1})` },
              { status: 400 }
            );
          }
          if (c2 > max2) {
            return NextResponse.json(
              { error: `Assignment failed. Team would exceed category limit. (2nd category: ${c2}/${max2})` },
              { status: 400 }
            );
          }
          if (c3 > max3) {
            return NextResponse.json(
              { error: `Assignment failed. Team would exceed category limit. (3rd category: ${c3}/${max3})` },
              { status: 400 }
            );
          }
          if (c4 > max4) {
            return NextResponse.json(
              { error: `Assignment failed. Team would exceed category limit. (4th category: ${c4}/${max4})` },
              { status: 400 }
            );
          }
        }
      } catch (err) {
        console.error('Error during backend quota validation:', err);
      }
    }

    // Fetch team name mapping from Firestore team_seasons (parallel with SQL updates)
    const teamNameMapPromise = (async () => {
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
      return teamNameMap;
    })();

    // Update all players in parallel (SQL operations)
    const sqlUpdatesPromise = Promise.all(
      players.map(async (player) => {
        if (isModern) {
          // S16 / S17: update player_seasons table
          return sql`
            UPDATE player_seasons
            SET team_id = ${player.teamId},
                auction_value = ${player.auctionValue},
                updated_at = NOW()
            WHERE id = ${player.id}
          `;
        } else {
          // S18+: update realplayerstats table
          return sql`
            UPDATE realplayerstats
            SET team_id = ${player.teamId},
                price = ${player.auctionValue},
                updated_at = NOW()
            WHERE id = ${player.id}
          `;
        }
      })
    );

    // Wait for both team names and SQL updates to complete
    const [teamNameMap] = await Promise.all([
      teamNameMapPromise,
      sqlUpdatesPromise
    ]);

    // Track budget changes per team
    const teamBudgetChanges = new Map<string, number>();
    players.forEach(player => {
      const currentChange = teamBudgetChanges.get(player.teamId) || 0;
      teamBudgetChanges.set(player.teamId, currentChange + player.auctionValue);
    });

    // Prepare all Firestore operations
    // We need to read team budgets first (unavoidable for accuracy)
    const teamBudgetReads = Array.from(teamBudgetChanges.keys()).map(async (teamId) => {
      const teamSeasonId = `${teamId}_${seasonId}`;
      const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonId);
      try {
        const doc = await teamSeasonRef.get();
        return { teamId, teamSeasonRef, data: doc.exists ? doc.data() : null };
      } catch (error) {
        console.error(`Error reading team ${teamId} budget:`, error);
        return { teamId, teamSeasonRef, data: null };
      }
    });

    // Execute all team budget reads in parallel
    const teamBudgetData = await Promise.all(teamBudgetReads);

    // Now create batch with all operations
    const batch = adminDb.batch();
    const timestamp = new Date();

    // Add team budget updates to batch
    teamBudgetData.forEach(({ teamId, teamSeasonRef, data }) => {
      if (data) {
        const totalSpent = teamBudgetChanges.get(teamId) || 0;
        const currentBudget = data.real_player_budget || 1000;
        const currentSpent = data.real_player_spent || 0;

        batch.update(teamSeasonRef, {
          real_player_budget: currentBudget - totalSpent,
          real_player_spent: currentSpent + totalSpent,
          updated_at: timestamp,
        });
      }
    });

    // Add transactions and notifications to batch
    players.forEach(player => {
      const teamName = teamNameMap.get(player.teamId) || 'Unknown Team';
      
      // Transaction
      const transactionId = `${player.teamId}_${seasonId}_${player.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const transactionRef = adminDb.collection('transactions').doc(transactionId);
      batch.set(transactionRef, {
        team_id: player.teamId,
        team_name: teamName,
        season_id: seasonId,
        player_id: player.id,
        player_name: player.playerName,
        transaction_type: 'player_assignment',
        amount: player.auctionValue,
        currency_type: 'real_player',
        description: `${player.playerName} assigned to ${teamName} for ${player.auctionValue} coins`,
        created_at: timestamp,
        created_by: auth.userId || 'system',
      });

      // Notification
      const notificationId = `${player.teamId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const notificationRef = adminDb.collection('notifications').doc(notificationId);
      batch.set(notificationRef, {
        team_id: player.teamId,
        season_id: seasonId,
        type: 'player_assignment',
        title: 'New Player Assigned',
        message: `${player.playerName} has been assigned to your team for ${player.auctionValue} coins`,
        read: false,
        created_at: timestamp,
        data: {
          player_id: player.id,
          player_name: player.playerName,
          auction_value: player.auctionValue,
          team_name: teamName,
        }
      });
    });

    // Commit all Firestore operations in a single batch (atomic & fast)
    await batch.commit();

    console.log(`[assign-bulk] Successfully assigned ${players.length} players with batched operations`);

    // Send FCM push notifications to all affected teams
    try {
      // Group players by team to send one notification per team
      const teamPlayers = new Map<string, Array<any>>();
      players.forEach(player => {
        if (!teamPlayers.has(player.teamId)) {
          teamPlayers.set(player.teamId, []);
        }
        teamPlayers.get(player.teamId)!.push(player);
      });

      // Send notifications in parallel
      await Promise.all(
        Array.from(teamPlayers.entries()).map(async ([teamId, teamPlayersList]) => {
          const teamName = teamNameMap.get(teamId) || 'Unknown Team';
          const playerCount = teamPlayersList.length;
          const totalValue = teamPlayersList.reduce((sum, p) => sum + p.auctionValue, 0);

          const notificationTitle = playerCount === 1
            ? '🎉 New Player Assigned!'
            : `🎉 ${playerCount} Players Assigned!`;

          const notificationBody = playerCount === 1
            ? `${teamPlayersList[0].playerName} has been assigned to ${teamName} for ${teamPlayersList[0].auctionValue} coins`
            : `${playerCount} players have been assigned to ${teamName} for a total of ${totalValue} coins`;

          await sendNotification(
            {
              title: notificationTitle,
              body: notificationBody,
              url: '/dashboard/team/squad',
              icon: '/logo.png',
              data: {
                type: 'player_assignment',
                season_id: seasonId,
                team_id: teamId,
                player_count: playerCount.toString(),
              }
            },
            { teamId }
          );

          console.log(`[assign-bulk] Sent FCM notification to team ${teamId} for ${playerCount} player(s)`);
        })
      );

      console.log(`[assign-bulk] Successfully sent FCM notifications to ${teamPlayers.size} team(s)`);
    } catch (notificationError) {
      console.error('[assign-bulk] Error sending FCM notifications:', notificationError);
      // Don't fail the request if notifications fail
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
