import { NextRequest, NextResponse } from 'next/server';
import { getAuctionDb } from '@/lib/neon/auction-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { closePlayerHistory } from '@/lib/player-history';
import { sendNotification } from '@/lib/notifications/send-notification';
import { logReleaseRefund } from '@/lib/transaction-logger';

/**
 * POST /api/players/release-football-player
 * Release a football player with mid-season support and manual refund percentage
 * 
 * Body:
 * {
 *   playerId: string,           // player_id from footballplayers
 *   seasonId: string,           // current season (e.g., "sspsls16")
 *   releaseTiming: 'start' | 'mid', // when to release
 *   refundPercentage: number,   // Manual refund percentage (0-100)
 *   releasedBy: string,         // admin UID
 *   releasedByName: string      // admin name
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            playerId,
            seasonId,
            releaseTiming,
            refundPercentage,
            releasedBy,
            releasedByName
        } = body;

        // Validate required fields
        if (!playerId || !seasonId || !releaseTiming || refundPercentage === undefined || !releasedBy || !releasedByName) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing required fields',
                    errorCode: 'MISSING_FIELDS'
                },
                { status: 400 }
            );
        }

        if (!['start', 'mid'].includes(releaseTiming)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid release timing. Must be "start" or "mid"',
                    errorCode: 'INVALID_TIMING'
                },
                { status: 400 }
            );
        }

        if (typeof refundPercentage !== 'number' || refundPercentage < 0 || refundPercentage > 100) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid refundPercentage. Must be a number between 0 and 100',
                    errorCode: 'INVALID_REFUND_PERCENTAGE'
                },
                { status: 400 }
            );
        }

        const sql = getAuctionDb();

        // Fetch player details for the specific season (case-insensitive)
        let players = await sql`
      SELECT 
        id,
        player_id,
        name as player_name,
        team_id,
        acquisition_value,
        season_id
      FROM footballplayers
      WHERE (player_id = ${playerId} OR id::text = ${playerId}) 
        AND (LOWER(season_id) = LOWER(${seasonId}) OR season_id IS NULL) 
        AND (retired IS NOT TRUE)
      ORDER BY updated_at DESC
      LIMIT 1
    `;

        // If not found with season_id, check player_history for active team assignment
        if (players.length === 0 || !players[0].team_id) {
            const historyActive = await sql`
        SELECT 
          ph.player_id,
          ph.player_name,
          ph.team_id,
          ph.acquisition_value,
          ph.season_id
        FROM player_history ph
        WHERE (ph.player_id = ${playerId} OR ph.player_id = (SELECT player_id FROM footballplayers WHERE id::text = ${playerId} LIMIT 1))
          AND ph.status = 'active'
        ORDER BY ph.created_at DESC
        LIMIT 1
      `;
            if (historyActive.length > 0 && historyActive[0].team_id) {
                const h = historyActive[0];
                players = [{
                    id: playerId,
                    player_id: h.player_id,
                    player_name: h.player_name,
                    team_id: h.team_id,
                    acquisition_value: h.acquisition_value,
                    season_id: h.season_id
                }];
            }
        }

        if (players.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Player not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                },
                { status: 404 }
            );
        }

        const player = players[0];

        if (!player.team_id) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Player is already a free agent',
                    errorCode: 'ALREADY_FREE_AGENT'
                },
                { status: 400 }
            );
        }

        if (!player.acquisition_value) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Player acquisition value is missing',
                    errorCode: 'INCOMPLETE_DATA'
                },
                { status: 400 }
            );
        }

        // Calculate refund amount using manual percentage (simple single-season model)
        const refundAmount = Math.round(player.acquisition_value * (refundPercentage / 100));

        // Fetch team details from teams table
        const teams = await sql`
      SELECT id, name as team_name
      FROM teams
      WHERE id = ${player.team_id}
    `;

        if (teams.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Team not found',
                    errorCode: 'TEAM_NOT_FOUND'
                },
                { status: 404 }
            );
        }

        const team = teams[0];

        // Store team_id for notification before releasing
        const releasedFromTeamId = player.team_id;

        // Execute database updates
        // 1. Update footballplayers table - release player for current season
        const playerSeasonId = player.season_id || seasonId;
        await sql`
      UPDATE footballplayers
      SET 
        team_id = NULL,
        status = 'free_agent',
        is_sold = false,
        updated_at = NOW()
      WHERE player_id = ${playerId} AND season_id = ${playerSeasonId}
    `;

        // 2. Close player_history record with proper season notation (e.g. SSPSLS18.5 for mid-season)
        const seasonNum = seasonId.replace(/\D/g, '');
        const endSeason = releaseTiming === 'mid' ? `SSPSLS${seasonNum}.5` : seasonId.toUpperCase();

        try {
            await closePlayerHistory(
                playerId,
                player.team_id,
                'release',
                endSeason
            );
            console.log(`✅ Closed player_history for ${player.player_name} (${endSeason})`);
        } catch (historyError) {
            console.error('Error closing player_history:', historyError);
            // Continue even if player_history update fails
        }

        // 3. Remove from team_players table if exists
        try {
            await sql`
        DELETE FROM team_players
        WHERE player_id = ${player.id}
      `;
            console.log(`✅ Removed from team_players table`);
        } catch (teamPlayerError) {
            console.warn('Could not delete from team_players:', teamPlayerError);
        }

        // 4. Update team balance in Main DB team_seasons
        let currentBalance = 0;
        if (player.team_id && typeof player.team_id === 'string' && player.team_id.trim() !== '') {
            try {
                const { getMainDb } = await import('@/lib/neon/main-config');
                const mainSql = getMainDb();
                const cleanTeamId = player.team_id.trim();
                const teamSeasonDocId = `${cleanTeamId}_${seasonId}`;

                const existingRows = await mainSql`
                    SELECT id, team_id, season_id, football_budget, football_spent, raw_data
                    FROM team_seasons
                    WHERE id = ${teamSeasonDocId} OR (team_id = ${cleanTeamId} AND season_id = ${seasonId})
                    LIMIT 1
                `;

                if (existingRows.length > 0) {
                    const row = existingRows[0];
                    const rawBudget = Number(row.raw_data?.football_budget);
                    const colBudget = Number(row.football_budget);
                    currentBalance = !isNaN(rawBudget) && rawBudget > 0 ? rawBudget : (!isNaN(colBudget) ? colBudget : 0);
                    const newBalance = currentBalance + refundAmount;
                    const currentSpent = Number(row.football_spent ?? row.raw_data?.football_spent ?? 0);
                    const newSpent = Math.max(0, currentSpent - refundAmount);

                    await mainSql`
                        UPDATE team_seasons
                        SET 
                            football_budget = ${newBalance},
                            football_spent = ${newSpent},
                            raw_data = jsonb_set(
                                jsonb_set(
                                    COALESCE(raw_data, '{}'::jsonb),
                                    '{football_budget}',
                                    to_jsonb(${newBalance}::numeric)
                                ),
                                '{football_spent}',
                                to_jsonb(${newSpent}::numeric)
                            ),
                            updated_at = NOW()
                        WHERE id = ${row.id}
                    `;

                    console.log(`✅ Updated Main DB team_seasons balance: ${currentBalance} → ${newBalance} (+${refundAmount})`);
                } else {
                    console.warn(`⚠️ Team season document not found in Main DB: ${teamSeasonDocId}`);
                }
            } catch (mainDbError) {
                console.error('Error updating Main DB team_seasons balance:', mainDbError);
            }
        }

        // 5. Update team balance in Neon teams table (auction DB)
        try {
            await sql`
                UPDATE teams
                SET 
                    football_budget = football_budget + ${refundAmount},
                    updated_at = NOW()
                WHERE id = ${player.team_id}
            `;
            console.log(`✅ Updated Neon teams table football_budget (+${refundAmount})`);
        } catch (neonError) {
            console.error('Error updating Neon teams table:', neonError);
            // Continue even if Neon update fails
        }

        // 6. Log the transaction in Neon DB & Firestore
        try {
            await logReleaseRefund(
                player.team_id,
                seasonId,
                player.player_name,
                playerId,
                'football',
                refundAmount,
                currentBalance
            );
            console.log(`✅ Logged release transaction for ${player.player_name}`);
        } catch (txnError) {
            console.error('Error logging release transaction:', txnError);
        }

        // 7. Send FCM notification to the team
        try {
            await sendNotification(
                {
                    title: '📤 Player Released',
                    body: `${player.player_name} has been released from your team. Refund: ${refundAmount} coins (${refundPercentage}%)`,
                    url: '/dashboard/team/squad',
                    icon: '/logo.png',
                    data: {
                        type: 'player_release',
                        season_id: seasonId,
                        player_name: player.player_name,
                        player_type: 'football',
                        refund_amount: refundAmount.toString(),
                        refund_percentage: refundPercentage.toString(),
                    }
                },
                { teamId: releasedFromTeamId }
            );

            console.log(`[release-football-player] FCM notification sent to team ${releasedFromTeamId}`);
        } catch (notificationError) {
            console.error('[release-football-player] Error sending FCM notification:', notificationError);
            // Don't fail the request if notification fails
        }

        return NextResponse.json({
            success: true,
            message: `${player.player_name} released successfully`,
            data: {
                player_name: player.player_name,
                player_id: playerId,
                old_team: team.team_name,
                season_id: seasonId,
                release_timing: releaseTiming,
                acquisition_value: player.acquisition_value,
                refund_info: {
                    refund_percentage: refundPercentage + '%',
                    refund_amount: refundAmount
                }
            }
        });

    } catch (error: any) {
        console.error('Error in release-football-player API:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to release player',
                errorCode: 'SYSTEM_ERROR'
            },
            { status: 500 }
        );
    }
}
