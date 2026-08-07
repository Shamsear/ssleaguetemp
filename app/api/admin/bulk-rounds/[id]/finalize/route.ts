import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { adminDb } from '@/lib/firebase/admin';
import { logAuctionWin } from '@/lib/transaction-logger';
import { triggerNews } from '@/lib/news/trigger';
import { generateTiebreakerId } from '@/lib/id-generator';
import { broadcastSquadUpdate, broadcastWalletUpdate, broadcastRoundUpdate } from '@/lib/realtime/broadcast';
import { sendNotification, sendNotificationToSeason } from '@/lib/notifications/send-notification';
import { createPlayerHistory } from '@/lib/player-history';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * Helper to assign player to winning team in both Postgres and Firebase
 */
async function assignPlayerToTeam(
  roundId: string,
  seasonId: string,
  price: number,
  playerId: string,
  playerName: string,
  position: string,
  teamId: string,
  teamName: string
) {
  console.log(`👤 Assigning player ${playerName} (${playerId}) to team ${teamName} (${teamId}) for £${price}`);

  // 1. Update round_players table
  await sql`
    UPDATE round_players
    SET 
      winning_team_id = ${teamId},
      winning_bid = ${price},
      status = 'sold'
    WHERE round_id = ${roundId}
    AND player_id = ${playerId}
  `;

  // 2. Mark the winning bid in round_bids
  await sql`
    UPDATE round_bids
    SET is_winning = true
    WHERE round_id = ${roundId}
    AND player_id = ${playerId}
    AND team_id = ${teamId}
  `;

  // 3. Check if player is already assigned to this team in this season (idempotency check)
  const existingPlayerAssignment = await sql`
    SELECT team_id FROM team_players
    WHERE player_id = ${playerId}
    AND season_id = ${seasonId}
  `;

  const isNewPurchase = existingPlayerAssignment.length === 0 || 
                        existingPlayerAssignment[0].team_id !== teamId;

  // 4. Insert/update into team_players
  await sql`
    INSERT INTO team_players (
      team_id,
      player_id,
      season_id,
      round_id,
      purchase_price,
      acquired_at
    ) VALUES (
      ${teamId},
      ${playerId},
      ${seasonId},
      ${roundId},
      ${price},
      NOW()
    )
    ON CONFLICT (player_id, season_id) DO UPDATE
    SET 
      team_id = EXCLUDED.team_id,
      round_id = EXCLUDED.round_id,
      purchase_price = EXCLUDED.purchase_price
  `;

  // 5. Update footballplayers table
  await sql`
    UPDATE footballplayers
    SET 
      is_sold = true,
      team_id = ${teamId},
      team_name = ${teamName},
      acquisition_value = ${price},
      status = 'active',
      season_id = ${seasonId},
      round_id = ${roundId},
      contract_start_season = ${seasonId},
      contract_end_season = ${seasonId},
      contract_length = 1,
      updated_at = NOW()
    WHERE id = ${playerId}
  `;

  // Log to player_history
  try {
    await createPlayerHistory({
      playerId: playerId,
      playerName: playerName,
      position: position || null,
      teamId: teamId,
      teamName: teamName,
      seasonId: seasonId,
      acquisitionType: 'auction',
      acquisitionValue: price,
      contractStartSeason: seasonId,
      contractEndSeason: seasonId,
      roundId: roundId
    });
    console.log(`✅ Logged player_history for ${playerName} in assignPlayerToTeam`);
  } catch (historyError) {
    console.error(`❌ Failed to log player_history for ${playerName} in assignPlayerToTeam:`, historyError);
  }

  // 6. Update Neon teams table (Spent budget, players count)
  if (isNewPurchase) {
    try {
      await sql`
        UPDATE teams 
        SET 
          football_spent = football_spent + ${price},
          football_budget = football_budget - ${price},
          football_players_count = football_players_count + 1,
          updated_at = NOW()
        WHERE id = ${teamId}
        AND season_id = ${seasonId}
      `;
      console.log(` Neon teams budget updated successfully for ${teamId}`);
    } catch (error) {
      console.error(`❌ Error updating Neon teams budget for ${teamId}:`, error);
    }
  }

  // 7. Update Firebase team_seasons and log transaction
  const teamSeasonId = `${teamId}_${seasonId}`;
  const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonId);
  const teamSeasonSnap = await teamSeasonRef.get();

  if (teamSeasonSnap.exists) {
    const teamSeasonData = teamSeasonSnap.data();
    const currencySystem = teamSeasonData?.currency_system || 'single';
    const isDualCurrency = currencySystem === 'dual';

    const currentBudget = isDualCurrency
      ? (teamSeasonData?.football_budget || 0)
      : (teamSeasonData?.budget || 0);

    if (isNewPurchase) {
      const positionCounts = teamSeasonData?.position_counts || {};
      if (position && position in positionCounts) {
        positionCounts[position] = (positionCounts[position] || 0) + 1;
      }

      const updateData: any = {
        total_spent: (teamSeasonData?.total_spent || 0) + price,
        players_count: (teamSeasonData?.players_count || 0) + 1,
        position_counts: positionCounts,
        updated_at: new Date()
      };

      if (isDualCurrency) {
        updateData.football_budget = currentBudget - price;
        updateData.football_spent = (teamSeasonData?.football_spent || 0) + price;
      } else {
        updateData.budget = currentBudget - price;
      }

      await teamSeasonRef.update(updateData);
      console.log(` Firebase team_seasons balance updated successfully for ${teamId}`);

      // Log transaction in Firebase
      const teamFirebaseResult = await sql`
        SELECT firebase_uid FROM teams WHERE id = ${teamId} AND season_id = ${seasonId} LIMIT 1
      `;
      const firebaseUid = teamFirebaseResult[0]?.firebase_uid;

      if (firebaseUid) {
        await logAuctionWin(
          firebaseUid,
          seasonId,
          playerName,
          playerId,
          'football',
          price,
          currentBudget,
          roundId
        );
        console.log(` Transaction logged in Firebase for ${playerName}`);
      }

      // Broadcast squad and wallet updates via WebSocket
      await broadcastSquadUpdate(seasonId, teamId, {
        player_id: playerId,
        player_name: playerName,
        action: 'acquired',
        price,
      });

      await broadcastWalletUpdate(seasonId, teamId, {
        new_balance: isDualCurrency ? updateData.football_budget : updateData.budget,
        amount_spent: price,
        currency_type: isDualCurrency ? 'football' : 'single',
      });
    }
  }
}

/**
 * Helper to automatically create tiebreaker infrastructure for conflicted player
 */
async function createTiebreakerForPlayer(
  roundId: string,
  seasonId: string,
  basePrice: number,
  playerId: string,
  playerName: string,
  position: string,
  bids: any[],
  teamUidMap: Map<string, string>,
  notificationPromises: Promise<any>[]
) {
  console.log(`🎯 Creating tiebreaker for contested player ${playerName} (${playerId}) with ${bids.length} teams`);

  const tiebreakerId = await generateTiebreakerId();
  const tiedTeams = bids.map(bid => ({
    team_id: bid.team_id,
    team_name: bid.team_name
  }));

  // 1. Insert into general tiebreakers table
  await sql`
    INSERT INTO tiebreakers (
      id,
      round_id,
      player_id,
      player_name,
      original_amount,
      tied_teams,
      status,
      season_id,
      duration_minutes,
      created_at
    ) VALUES (
      ${tiebreakerId},
      ${roundId},
      ${playerId},
      ${playerName},
      ${basePrice},
      ${JSON.stringify(tiedTeams)}::jsonb,
      'active',
      ${seasonId},
      60,
      NOW()
    )
  `;

  // 2. Insert into team_tiebreakers
  for (const bid of bids) {
    const teamTiebreakerId = `${bid.team_id}_${tiebreakerId}`;
    await sql`
      INSERT INTO team_tiebreakers (
        id,
        tiebreaker_id,
        team_id,
        team_name,
        original_bid_id,
        submitted,
        new_bid_amount,
        created_at
      ) VALUES (
        ${teamTiebreakerId},
        ${tiebreakerId},
        ${bid.team_id},
        ${bid.team_name},
        null,
        false,
        NULL,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // 3. Insert into bulk_tiebreakers (Last Person Standing)
  await sql`
    INSERT INTO bulk_tiebreakers (
      id,
      bulk_round_id,
      season_id,
      player_id,
      player_name,
      player_position,
      base_price,
      status,
      teams_remaining,
      start_time,
      max_end_time,
      created_at,
      updated_at
    ) VALUES (
      ${tiebreakerId},
      ${roundId},
      ${seasonId},
      ${playerId},
      ${playerName},
      ${position},
      ${basePrice},
      'active',
      ${tiedTeams.length},
      NOW(),
      NOW() + INTERVAL '24 hours',
      NOW(),
      NOW()
    )
  `;

  // 4. Insert bulk_tiebreaker_teams records
  for (const bid of bids) {
    await sql`
      INSERT INTO bulk_tiebreaker_teams (
        tiebreaker_id,
        team_id,
        team_name,
        season_id,
        status,
        current_bid,
        joined_at
      ) VALUES (
        ${tiebreakerId},
        ${bid.team_id},
        ${bid.team_name},
        ${seasonId},
        'active',
        ${basePrice},
        NOW()
      )
      ON CONFLICT (tiebreaker_id, team_id) DO NOTHING
    `;
  }

  // 5. Update round_players status to 'pending' with correct bid counts
  await sql`
    UPDATE round_players
    SET 
      status = 'pending',
      bid_count = ${bids.length}
    WHERE round_id = ${roundId}
    AND player_id = ${playerId}
  `;

  // 6. Broadcast tiebreaker creation to team clients
  try {
    await broadcastRoundUpdate(seasonId, roundId, {
      type: 'tiebreaker_created',
      tiebreaker_id: tiebreakerId,
      player_id: playerId,
      player_name: playerName,
      team_count: bids.length,
    });
  } catch (err) {
    console.error(`❌ WebSocket broadcast error for tiebreaker ${tiebreakerId}:`, err);
  }

  // 7. Queue FCM notification targeted ONLY to the specific tied teams
  const tiedTeamUids = bids
    .map(b => teamUidMap.get(b.team_id))
    .filter(Boolean) as string[];

  if (tiedTeamUids.length > 0) {
    console.log(`📬 Queuing targeted notification for ${playerName} to ${tiedTeamUids.length} tied team(s)`);
    notificationPromises.push(
      sendNotification(
        {
          title: '⚔️ Tiebreaker Created!',
          body: `${playerName} is now in a tiebreaker. Submit your bid!`,
          url: `/tiebreakers/${tiebreakerId}`,
          icon: '/logo.png',
          data: {
            type: 'tiebreaker_created',
            tiebreaker_id: tiebreakerId,
            player_id: playerId,
            player_name: playerName,
            round_id: roundId,
            team_count: bids.length.toString(),
          }
        },
        { userIds: tiedTeamUids }
      ).catch(err => {
        console.error(`❌ FCM notification error for tiebreaker ${tiebreakerId}:`, err);
      })
    );
  }

  return tiebreakerId;
}

/**
 * POST /api/admin/bulk-rounds/:id/finalize
 * Finalize bulk round: assign single-bidder players, check and assign resolved tiebreakers,
 * auto-create tiebreakers on conflicts, and set round status dynamically.
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
    console.log(`🔍 Finalizing bulk round ${roundId}`);

    // Get round details
    const roundCheck = await sql`
      SELECT id, status, round_number, season_id, base_price
      FROM rounds
      WHERE id = ${roundId}
      AND round_type = 'bulk'
    `;

    if (roundCheck.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Bulk round not found' },
        { status: 404 }
      );
    }

    const round = roundCheck[0];

    // Allow finalization for active, expired, expired_pending_finalization, tiebreaker_pending or completed (to resolve new tiebreakers) rounds
    const validStatuses = ['active', 'expired', 'expired_pending_finalization', 'finalizing', 'tiebreaker_pending', 'completed'];
    if (!validStatuses.includes(round.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot finalize round. Current status: ${round.status}.` },
        { status: 400 }
      );
    }

    // Get all round players
    const roundPlayers = await sql`
      SELECT player_id, player_name, status, winning_team_id, position
      FROM round_players
      WHERE round_id = ${roundId}
    `;

    // Get all bids
    const allBids = await sql`
      SELECT player_id, team_id, team_name, bid_amount
      FROM round_bids
      WHERE round_id = ${roundId}
      ORDER BY bid_time ASC
    `;

    // Group bids by player
    const bidsByPlayer = new Map<string, any[]>();
    for (const bid of allBids) {
      if (!bidsByPlayer.has(bid.player_id)) {
        bidsByPlayer.set(bid.player_id, []);
      }
      bidsByPlayer.get(bid.player_id)!.push(bid);
    }

    // Get all existing tiebreakers for this bulk round
    const existingTiebreakers = await sql`
      SELECT id, player_id, status, current_highest_team_id, current_highest_bid
      FROM bulk_tiebreakers
      WHERE bulk_round_id = ${roundId}
    `;
    const tiebreakersMap = new Map();
    for (const tb of existingTiebreakers) {
      tiebreakersMap.set(tb.player_id, tb);
    }

    // Query all teams in the season to build the team_id -> firebase_uid map (avoids Firestore reads in loop)
    const teamsList = await sql`
      SELECT id, firebase_uid 
      FROM teams
      WHERE season_id = ${round.season_id}
    `;
    const teamUidMap = new Map<string, string>();
    for (const team of teamsList) {
      if (team.firebase_uid) {
        teamUidMap.set(team.id, team.firebase_uid);
      }
    }

    // Array to collect notification promises for parallel processing
    const notificationPromises: Promise<any>[] = [];

    // Track operation counts
    let immediatelyAssigned = 0;
    let tiebreakerResolvedAssigned = 0;
    let tiebreakersCreated = 0;
    let activeTiebreakersCount = 0;

    const allocationsList = [];

    // Process each player in the round players list
    for (const player of roundPlayers) {
      const playerId = player.player_id;
      const playerName = player.player_name;
      const position = player.position || 'Unknown';

      // If player is already sold (e.g. from previous finalization run), keep as sold
      if (player.status === 'sold') {
        continue;
      }

      // Check if a tiebreaker already exists
      const tb = tiebreakersMap.get(playerId);
      if (tb) {
        if (tb.status === 'resolved' || tb.status === 'finalized') {
          // Tiebreaker is completed - assign player to winner
          if (tb.current_highest_team_id) {
            const teamCheck = await sql`
              SELECT team_name FROM teams 
              WHERE id = ${tb.current_highest_team_id} AND season_id = ${round.season_id}
              LIMIT 1
            `;
            const teamName = teamCheck[0]?.team_name || 'Winner Team';

            await assignPlayerToTeam(
              roundId,
              round.season_id,
              tb.current_highest_bid,
              playerId,
              playerName,
              position,
              tb.current_highest_team_id,
              teamName
            );

            tiebreakerResolvedAssigned++;
            allocationsList.push({
              player_name: playerName,
              team_name: teamName,
              amount: tb.current_highest_bid
            });
          }
        } else {
          // Tiebreaker is active/pending - increment unresolved count
          activeTiebreakersCount++;
        }
        continue;
      }

      // No tiebreaker exists. Get bids for the player.
      const bids = bidsByPlayer.get(playerId) || [];

      if (bids.length === 0) {
        // Player got no bids - mark unsold
        await sql`
          UPDATE round_players
          SET status = 'unsold', bid_count = 0
          WHERE round_id = ${roundId}
          AND player_id = ${playerId}
        `;
      } else if (bids.length === 1) {
        // Player has exactly 1 bid - assign immediately to single bidder
        const bid = bids[0];

        // Check if team has slots
        const teamSlotCheck = await sql`
          SELECT football_total_slots, football_players_count
          FROM teams
          WHERE id = ${bid.team_id}
          AND season_id = ${round.season_id}
        `;
        const slots = teamSlotCheck[0];
        const availableSlots = (parseInt(slots?.football_total_slots) || 25) - (parseInt(slots?.football_players_count) || 0);

        if (availableSlots <= 0) {
          console.warn(`⚠️ Team ${bid.team_id} has no slots. Marking ${playerName} unsold.`);
          await sql`
            UPDATE round_players
            SET status = 'unsold', bid_count = 1
            WHERE round_id = ${roundId}
            AND player_id = ${playerId}
          `;
        } else {
          await assignPlayerToTeam(
            roundId,
            round.season_id,
            round.base_price,
            playerId,
            playerName,
            position,
            bid.team_id,
            bid.team_name
          );

          immediatelyAssigned++;
          allocationsList.push({
            player_name: playerName,
            team_name: bid.team_name,
            amount: round.base_price
          });
        }
      } else {
        // Player has multiple bids (conflict) and no tiebreaker yet - auto-create tiebreaker
        await createTiebreakerForPlayer(
          roundId,
          round.season_id,
          round.base_price,
          playerId,
          playerName,
          position,
          bids,
          teamUidMap,
          notificationPromises
        );

        tiebreakersCreated++;
        activeTiebreakersCount++;
      }
    }

    // Determine the round status dynamically
    // If we still have active tiebreakers (either newly created or unresolved existing ones),
    // mark round status as 'tiebreaker_pending'. Otherwise mark as 'completed'.
    const newStatus = activeTiebreakersCount > 0 ? 'tiebreaker_pending' : 'completed';
    await sql`
      UPDATE rounds
      SET status = ${newStatus}, updated_at = NOW()
      WHERE id = ${roundId}
    `;

    console.log(`\n🎉 Bulk round ${roundId} finalization run complete!`);
    console.log(`   Singles assigned immediately: ${immediatelyAssigned}`);
    console.log(`   Assigned from completed tiebreakers: ${tiebreakerResolvedAssigned}`);
    console.log(`   New tiebreakers created: ${tiebreakersCreated}`);
    console.log(`   Active tiebreakers remaining: ${activeTiebreakersCount}`);
    console.log(`   New round status: ${newStatus}`);

    // Broadcast round update via Firebase Realtime DB
    await broadcastRoundUpdate(round.season_id, roundId, {
      status: newStatus,
      immediately_assigned: immediatelyAssigned + tiebreakerResolvedAssigned,
      tiebreakers_created: tiebreakersCreated,
      finalized: newStatus === 'completed',
    });

    // Trigger news headlines if new players were allocated in this run
    if (allocationsList.length > 0) {
      try {
        const totalSpent = allocationsList.reduce((sum, item) => sum + item.amount, 0);
        const avgBid = allocationsList.length > 0 ? (totalSpent / allocationsList.length) : round.base_price;

        await triggerNews('auction_highlights', {
          season_id: round.season_id,
          round_id: roundId,
          round_number: round.round_number,
          round_type: 'bulk',
          total_spent: totalSpent,
          average_bid: avgBid,
          base_price: round.base_price,
          players_allocated: allocationsList.length,
          conflicts_created: tiebreakersCreated,
          all_allocations: allocationsList,
        });
        console.log('📰 News highlights generated successfully.');
      } catch (newsError) {
        console.error('❌ Failed to generate news:', newsError);
      }
    }

    // Trigger general finalization notification (Only once at the end of the round)
    try {
      const totalAssigned = immediatelyAssigned + tiebreakerResolvedAssigned;
      notificationPromises.push(
        sendNotificationToSeason(
          {
            title: '🏁 Bulk Round Finalized!',
            body: `Round ${round.round_number} results are in: ${totalAssigned} players assigned${activeTiebreakersCount > 0 ? `, ${activeTiebreakersCount} tiebreakers active` : ''}.`,
            url: `/dashboard/committee/bulk-rounds/${roundId}`,
            icon: '/logo.png',
            data: {
              type: 'bulk_round_finalized',
              roundId,
              roundNumber: round.round_number.toString(),
              assignedCount: totalAssigned.toString(),
              tiebreakersCount: activeTiebreakersCount.toString()
            }
          },
          round.season_id
        ).catch(err => {
          console.error('❌ Failed to send bulk round finalize notification:', err);
        })
      );
    } catch (notifError) {
      console.error('❌ Failed to queue bulk round finalize notification:', notifError);
    }

    // ⚡ Await all notifications concurrently to prevent blocking execution sequential timeouts on Vercel
    if (notificationPromises.length > 0) {
      console.log(`⏳ Awaiting ${notificationPromises.length} notifications in parallel...`);
      await Promise.allSettled(notificationPromises);
      console.log(`✅ All notifications processed.`);
    }

    return NextResponse.json({
      success: true,
      data: {
        round_id: roundId,
        round_number: round.round_number,
        status: newStatus,
        immediately_assigned: immediatelyAssigned + tiebreakerResolvedAssigned,
        conflicts: tiebreakersCreated,
        tiebreakers_created: tiebreakersCreated,
        active_tiebreakers_remaining: activeTiebreakersCount,
        message: newStatus === 'completed'
          ? `All players assigned successfully! Bulk round completed.`
          : `Processed successfully. Assigned ${immediatelyAssigned} single-bidders and ${tiebreakerResolvedAssigned} resolved tiebreakers. Created ${tiebreakersCreated} new tiebreakers.`
      }
    });

  } catch (error: any) {
    console.error('❌ Error finalizing bulk round:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
