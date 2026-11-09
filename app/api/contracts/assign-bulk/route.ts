import { getMainDb } from '@/lib/neon/main-config';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
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

        let categories: any[] = [];
        try {
          const { getMainDb } = await import('@/lib/neon/main-config');
          const mainSql = getMainDb();
          const catRows = await mainSql`SELECT name, max_players FROM categories ORDER BY sort_order ASC, name ASC`;
          categories = catRows.map((cat: any, idx: number) => ({
            name: cat.name,
            max_players: (cat.max_players !== undefined && Number(cat.max_players) > 0)
              ? Number(cat.max_players)
              : (idx === 0 || String(cat.name || '').toLowerCase() === 'red' ? 2 : 1)
          }));
        } catch (catErr) {
          const categoriesSnapshot = await adminDb.collection('categories').orderBy('priority', 'asc').get();
          categories = categoriesSnapshot.docs.map((doc, idx) => {
            const data = doc.data();
            return {
              name: data.name,
              max_players: (data.max_players !== undefined && Number(data.max_players) > 0)
                ? Number(data.max_players)
                : (idx === 0 || String(data.name || '').toLowerCase() === 'red' ? 2 : 1)
            };
          });
        }

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

          // Count players in each category
          const counts = new Map<string, number>();
          projectedPlayers.forEach((p: any) => {
            const cat = p.category || '';
            counts.set(cat.toLowerCase(), (counts.get(cat.toLowerCase()) || 0) + 1);
          });

          // Check limits dynamically
          for (const cat of categories) {
            const current = counts.get(cat.name.toLowerCase()) || 0;
            if (current > cat.max_players) {
              return NextResponse.json(
                { error: `Assignment failed. Team would exceed category limit. (Category "${cat.name}": ${current}/${cat.max_players})` },
                { status: 400 }
              );
            }
          }
        }
      } catch (err: any) {
        console.error('Error during backend quota validation:', err);
      }
    }

    // Fetch team name mapping from Neon team_seasons first
    const teamNameMap = new Map<string, string>();
    try {
      const { getMainDb } = await import('@/lib/neon/main-config');
      const mainSql = getMainDb();
      const rows = await mainSql`SELECT team_id, id, team_name FROM team_seasons WHERE season_id = ${seasonId}`;
      rows.forEach((row: any) => {
        const tId = row.team_id || row.id.split('_')[0];
        const tName = row.team_name || 'Unknown Team';
        teamNameMap.set(tId, tName.toUpperCase());
      });
    } catch (e) {
      console.error('Error fetching team names from Neon:', e);
    }

    if (teamNameMap.size === 0) {
      try {
        const teamSeasonsSnap = await adminDb.collection('team_seasons')
          .where('season_id', '==', seasonId)
          .get();
        teamSeasonsSnap.docs.forEach(doc => {
          const data = doc.data();
          const tId = data.team_id || doc.id.split('_')[0];
          const tName = data.team_name || data.team_code || 'Unknown Team';
          teamNameMap.set(tId, tName.toUpperCase());
        });
      } catch (e) {
        console.error('Error fetching team names from Firestore:', e);
      }
    }

    // Update all players in parallel (SQL operations) with capitalized team names
    await Promise.all(
      players.map(async (player) => {
        const teamName = teamNameMap.get(player.teamId) || null;
        if (isModern) {
          // S16 / S17: update player_seasons table
          return sql`
            UPDATE player_seasons
            SET team_id = ${player.teamId},
                team = ${teamName},
                auction_value = ${player.auctionValue},
                updated_at = NOW()
            WHERE id = ${player.id}
          `;
        } else {
          // S18+: update realplayerstats table
          return sql`
            UPDATE realplayerstats
            SET team_id = ${player.teamId},
                team = ${teamName},
                price = ${player.auctionValue},
                updated_at = NOW()
            WHERE id = ${player.id}
          `;
        }
      })
    );

    // Update team budgets in Neon Main DB and Firestore based on actual assigned roster
    try {
      const { getMainDb } = await import('@/lib/neon/main-config');
      const mainSql = getMainDb();
      const uniqueTeamIds = Array.from(new Set(players.map(p => p.teamId)));

      for (const teamId of uniqueTeamIds) {
        const teamSeasonId = `${teamId}_${seasonId}`;

        // Calculate actual total spent from tournament DB for this team
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

        // Fetch initial budget from team_seasons or default to 400
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
      }
    } catch (neonBudgetErr) {
      console.error('Error updating team budget in Neon:', neonBudgetErr);
    }

    // Now create batch for transactions and notifications
    const batch = adminDb.batch();
    const timestamp = new Date();

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
