import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    // Get season ID
    const params = await context.params;
    const seasonId = params.id;

    if (!seasonId) {
      return NextResponse.json(
        { error: 'Season ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication (super admin only)
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Forbidden: Super admin access required' },
        { status: 401 }
      );
    }

    // Parse request body
    const { teams, players } = await request.json();

    if (!teams && !players) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    // Use Firestore batch for atomic updates
    const batch = adminDb.batch();
    let updateCount = 0;
    const sql = getTournamentDb();

    // 1. Delete removed teams and their stats/trophies from Firestore/Neon
    if (teams && Array.isArray(teams)) {
      const sentTeamIds = new Set(teams.map(t => t.id).filter(Boolean));
      
      const existingTeamsSnapshot = await adminDb.collection('teams')
        .where('seasons', 'array-contains', seasonId)
        .where('is_historical', '==', true)
        .get();

      const deletedTeamIds: string[] = [];

      for (const doc of existingTeamsSnapshot.docs) {
        if (!sentTeamIds.has(doc.id)) {
          const teamData = doc.data();
          const updatedSeasons = (teamData.seasons || []).filter((s: string) => s !== seasonId);
          
          if (updatedSeasons.length === 0) {
            batch.delete(doc.ref);
          } else {
            batch.update(doc.ref, { seasons: updatedSeasons, updated_at: new Date() });
          }
          deletedTeamIds.push(doc.id);
        }
      }

      console.log(`🗑️ Deleting ${deletedTeamIds.length} teams from Firestore/Neon:`, deletedTeamIds);

      if (deletedTeamIds.length > 0) {
        // Delete teamstats
        await sql`
          DELETE FROM teamstats
          WHERE season_id = ${seasonId} AND team_id IN (${deletedTeamIds})
        `;

        // Delete team trophies
        await sql`
          DELETE FROM team_trophies
          WHERE season_id = ${seasonId} AND team_id IN (${deletedTeamIds})
        `;
      }
    }

    // 2. Delete removed players and their stats/awards from Firestore/Neon
    if (players && Array.isArray(players)) {
      const sentPlayerStatsIds = new Set(players.map(p => p.id).filter(Boolean));
      
      const existingStatsSnapshot = await adminDb.collection('realplayerstats')
        .where('season_id', '==', seasonId)
        .get();
        
      const deletedPlayerStatsIds: string[] = [];
      const deletedPlayerIds: string[] = [];

      existingStatsSnapshot.forEach(doc => {
        if (!sentPlayerStatsIds.has(doc.id)) {
          batch.delete(doc.ref);
          deletedPlayerStatsIds.push(doc.id);
          const data = doc.data();
          if (data.player_id) {
            deletedPlayerIds.push(data.player_id);
          }
        }
      });

      console.log(`🗑️ Deleting ${deletedPlayerStatsIds.length} player stats from Firestore/Neon:`, deletedPlayerStatsIds);

      if (deletedPlayerIds.length > 0) {
        // Delete stats
        await sql`
          DELETE FROM realplayerstats
          WHERE season_id = ${seasonId} AND player_id IN (${deletedPlayerIds})
        `;
        
        // Delete awards
        await sql`
          DELETE FROM player_awards
          WHERE season_id = ${seasonId} AND player_id IN (${deletedPlayerIds})
        `;
      }
    }

    // Update teams and their stats
    if (teams && Array.isArray(teams)) {
      for (const team of teams) {
        if (!team.id) continue;

        // Update team basic info
        const teamRef = adminDb.collection('teams').doc(team.id);
        const teamUpdateData: any = {
          team_name: team.team_name,
          team_code: team.team_code,
          updated_at: new Date()
        };

        // Add optional fields if they exist
        if (team.owner_name !== undefined) teamUpdateData.owner_name = team.owner_name;
        if (team.owner_email !== undefined) teamUpdateData.owner_email = team.owner_email;
        if (team.initial_balance !== undefined) teamUpdateData.initial_balance = team.initial_balance;
        if (team.current_balance !== undefined) teamUpdateData.current_balance = team.current_balance;

        batch.update(teamRef, teamUpdateData);
        updateCount++;

        // Update teamstats in NEON if season_stats are provided
        if (team.season_stats && seasonId) {
          const tournamentId = 'historical';
          const teamStatsId = `${team.id}_${seasonId}_${tournamentId}`;

          // Extract stats fields
          const rank = team.season_stats.rank || 0;
          const points = team.season_stats.p || 0;
          const matchesPlayed = team.season_stats.mp || 0;
          const wins = team.season_stats.w || 0;
          const draws = team.season_stats.d || 0;
          const losses = team.season_stats.l || 0;
          const goalsFor = team.season_stats.f || 0;
          const goalsAgainst = team.season_stats.a || 0;
          const goalDifference = team.season_stats.gd || 0;

          // Update in NEON
          await sql`
            INSERT INTO teamstats (
              id, team_id, season_id, tournament_id, team_name,
              rank, points, matches_played, wins, draws, losses,
              goals_for, goals_against, goal_difference, position,
              created_at, updated_at
            )
            VALUES (
              ${teamStatsId}, ${team.id}, ${seasonId}, ${tournamentId}, ${team.team_name},
              ${rank}, ${points}, ${matchesPlayed}, ${wins}, ${draws}, ${losses},
              ${goalsFor}, ${goalsAgainst}, ${goalDifference}, ${rank},
              NOW(), NOW()
            )
            ON CONFLICT (team_id, season_id, tournament_id) DO UPDATE
            SET
              team_name = EXCLUDED.team_name,
              rank = EXCLUDED.rank,
              points = EXCLUDED.points,
              matches_played = EXCLUDED.matches_played,
              wins = EXCLUDED.wins,
              draws = EXCLUDED.draws,
              losses = EXCLUDED.losses,
              goals_for = EXCLUDED.goals_for,
              goals_against = EXCLUDED.goals_against,
              goal_difference = EXCLUDED.goal_difference,
              position = EXCLUDED.position,
              updated_at = NOW()
          `;
          updateCount++;
        }
      }
    }

    // Update players
    if (players && Array.isArray(players)) {
      for (const player of players) {
        if (!player.id) continue;

        const permanentId = player.player_id || player.id.split('_')[0];
        const realPlayerRef = adminDb.collection('realplayers').doc(permanentId);
        const realPlayerStatsRef = adminDb.collection('realplayerstats').doc(player.id);

        const realPlayerDoc = await realPlayerRef.get();
        const realPlayerStatsDoc = await realPlayerStatsRef.get();

        if (realPlayerDoc.exists) {
          // Update realplayers (permanent info)
          const updateData: any = {
            name: player.name,
            updated_at: new Date()
          };

          // Add optional permanent fields
          if (player.display_name !== undefined) updateData.display_name = player.display_name;
          if (player.email !== undefined) updateData.email = player.email;
          if (player.phone !== undefined) updateData.phone = player.phone;
          if (player.psn_id !== undefined) updateData.psn_id = player.psn_id;
          if (player.xbox_id !== undefined) updateData.xbox_id = player.xbox_id;
          if (player.steam_id !== undefined) updateData.steam_id = player.steam_id;

          batch.update(realPlayerRef, updateData);
          updateCount++;
        }

        if (realPlayerStatsDoc.exists) {
          // Update realplayerstats (season-specific info)
          const updateData: any = {
            updated_at: new Date()
          };

          // Add season-specific fields
          if (player.category !== undefined) updateData.category = player.category;
          if (player.team !== undefined) updateData.team = player.team;
          if (player.role !== undefined) updateData.role = player.role;
          if (player.notes !== undefined) updateData.notes = player.notes;

          // Update stats if provided
          if (player.stats) {
            updateData.stats = player.stats;
          }

          // Handle trophy arrays
          const categoryTrophies: string[] = [];
          const individualTrophies: string[] = [];

          // Add category trophies
          if (player.category_wise_trophy_1) categoryTrophies.push(player.category_wise_trophy_1);
          if (player.category_wise_trophy_2) categoryTrophies.push(player.category_wise_trophy_2);

          // Add individual trophies
          if (player.individual_wise_trophy_1) individualTrophies.push(player.individual_wise_trophy_1);
          if (player.individual_wise_trophy_2) individualTrophies.push(player.individual_wise_trophy_2);

          // Only update if we have trophies
          if (categoryTrophies.length > 0) {
            updateData.category_trophies = categoryTrophies;
          }
          if (individualTrophies.length > 0) {
            updateData.individual_trophies = individualTrophies;
          }

          batch.update(realPlayerStatsRef, updateData);
          updateCount++;
        }

        // Also update/insert in Neon realplayerstats
        const pStats = player.stats || {};
        
        // Clean sheets handles both clean_sheets and cleansheets
        const cleanSheets = pStats.clean_sheets !== undefined ? pStats.clean_sheets : (pStats.cleansheets !== undefined ? pStats.cleansheets : 0);
        // POTM is motm_awards in Neon database
        const motmAwards = pStats.potm !== undefined ? pStats.potm : 0;
        // Matches won/lost/drawn
        const wins = pStats.win !== undefined ? pStats.win : (pStats.matches_won !== undefined ? pStats.matches_won : 0);
        const draws = pStats.draw !== undefined ? pStats.draw : (pStats.matches_drawn !== undefined ? pStats.matches_drawn : 0);
        const losses = pStats.loss !== undefined ? pStats.loss : (pStats.matches_lost !== undefined ? pStats.matches_lost : 0);
        const matchesPlayed = pStats.total_matches !== undefined ? pStats.total_matches : (pStats.matches_played !== undefined ? pStats.matches_played : 0);

        await sql`
          INSERT INTO realplayerstats (
            id, player_id, season_id, player_name,
            category, team, team_id,
            matches_played, matches_won, matches_drawn, matches_lost,
            goals_scored, goals_conceded, assists, wins, draws, losses,
            clean_sheets, motm_awards, points, star_rating,
            created_at, updated_at
          )
          VALUES (
            ${player.id}, ${permanentId}, ${seasonId}, ${player.name},
            ${player.category || ''}, ${player.team || ''}, ${player.team_id || null},
            ${matchesPlayed}, ${wins}, ${draws}, ${losses},
            ${pStats.goals_scored || 0}, ${pStats.goals_conceded || 0},
            ${pStats.assists || 0}, ${wins}, ${draws}, ${losses},
            ${cleanSheets}, ${motmAwards}, ${pStats.points || pStats.total_points || 0}, 3,
            NOW(), NOW()
          )
          ON CONFLICT (player_id, season_id) DO UPDATE
          SET
            player_name = EXCLUDED.player_name,
            category = EXCLUDED.category,
            team = EXCLUDED.team,
            team_id = EXCLUDED.team_id,
            matches_played = EXCLUDED.matches_played,
            matches_won = EXCLUDED.matches_won,
            matches_drawn = EXCLUDED.matches_drawn,
            matches_lost = EXCLUDED.matches_lost,
            goals_scored = EXCLUDED.goals_scored,
            goals_conceded = EXCLUDED.goals_conceded,
            assists = EXCLUDED.assists,
            wins = EXCLUDED.wins,
            draws = EXCLUDED.draws,
            losses = EXCLUDED.losses,
            clean_sheets = EXCLUDED.clean_sheets,
            motm_awards = EXCLUDED.motm_awards,
            points = EXCLUDED.points,
            updated_at = NOW()
        `;
        updateCount++;

        // If neither exists, it might be in a different collection
        if (!realPlayerDoc.exists && !realPlayerStatsDoc.exists) {
          const playerRef = adminDb.collection('players').doc(player.id);
          const playerDoc = await playerRef.get();

          if (playerDoc.exists) {
            const updateData: any = {
              name: player.name,
              category: player.category,
              team: player.team,
              updated_at: new Date()
            };

            if (player.stats) {
              updateData.stats = player.stats;
            }

            batch.update(playerRef, updateData);
            updateCount++;
          }
        }
      }
    }

    // Commit all updates
    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${updateCount} records`,
      updatedCount: updateCount
    });

  } catch (error: any) {
    console.error('Error in bulk update:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
