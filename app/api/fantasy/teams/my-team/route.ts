import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { neon } from '@neondatabase/serverless';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET /api/fantasy/teams/my-team?user_id=xxx
 * Get the fantasy team for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id query parameter is required' },
        { status: 400 }
      );
    }

    // Get user's fantasy team from PostgreSQL
    let resolvedTeam: any = null;

    const fantasyTeams = await fantasySql`
      SELECT * FROM fantasy_teams
      WHERE owner_uid = ${user_id} AND is_enabled = true
      LIMIT 1
    `;

    if (fantasyTeams.length > 0) {
      resolvedTeam = fantasyTeams[0];
    } else {
      // Fallback: look up by team_id using the user's Firebase team document
      // This covers teams registered via enable-all where owner_uid was stored differently
      const userDoc = await adminDb.collection('users').doc(user_id).get();
      if (!userDoc.exists) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      const userData = userDoc.data()!;
      const teamName = userData.teamName || userData.username || 'Team';

      // Try to find their team document in Firebase
      const teamsSnap = await adminDb.collection('teams')
        .where('uid', '==', user_id)
        .limit(1)
        .get();

      if (!teamsSnap.empty) {
        const firebaseTeamId = teamsSnap.docs[0].id;
        // Try lookup by team_id directly (owner_uid may be blank or mismatched)
        const byTeamId = await fantasySql`
          SELECT * FROM fantasy_teams
          WHERE team_id = ${firebaseTeamId} AND is_enabled = true
          LIMIT 1
        `;
        if (byTeamId.length > 0) {
          resolvedTeam = byTeamId[0];
          // Self-heal: fix the owner_uid in DB for future lookups
          await fantasySql`
            UPDATE fantasy_teams
            SET owner_uid = ${user_id}, updated_at = NOW()
            WHERE team_id = ${firebaseTeamId} AND (owner_uid IS NULL OR owner_uid = '')
          `;
        }
      }

      // If still nothing found, offer registration
      if (!resolvedTeam) {
        // Get current season info
        const tournamentSql = getTournamentDb();
        const primaryTournaments = await tournamentSql`
          SELECT season_id FROM tournaments
          WHERE is_primary = true
          AND status IN ('active', 'upcoming')
          ORDER BY created_at DESC
          LIMIT 1
        `;

        if (primaryTournaments.length === 0) {
          return NextResponse.json(
            { 
              error: 'No fantasy league available',
              message: 'No active season found. Fantasy leagues will be available when a new season starts.',
              can_register: false
            },
            { status: 404 }
          );
        }

        const seasonId = primaryTournaments[0].season_id;
        const seasonNumber = seasonId.replace('SSPSLS', '');
        const leagueId = `SSPSLFLS${seasonNumber}`;

        // Check: is there a fantasy_teams row for this league that is disabled?
        if (!teamsSnap?.empty) {
          const firebaseTeamId = teamsSnap!.docs[0].id;
          const disabledCheck = await fantasySql`
            SELECT * FROM fantasy_teams
            WHERE team_id = ${firebaseTeamId} AND league_id = ${leagueId}
            LIMIT 1
          `;
          if (disabledCheck.length > 0) {
            // Team IS registered but is_enabled = false — show pending message
            return NextResponse.json(
              { 
                error: 'Fantasy team not yet enabled',
                message: 'Your fantasy registration is pending committee approval.',
                can_register: false
              },
              { status: 404 }
            );
          }
        }

        return NextResponse.json(
          { 
            error: 'No fantasy team found',
            message: 'You have not registered for the fantasy league yet.',
            can_register: true,
            registration_info: {
              season_id: seasonId,
              league_id: leagueId,
              team_name: teamName
            }
          },
          { status: 404 }
        );
      }
    }

    const teamData = resolvedTeam;
    const teamId = teamData.team_id;
    const leagueId = teamData.league_id;

    // Get drafted players from PostgreSQL with draft order
    const squadPlayers = await fantasySql`
      SELECT DISTINCT ON (s.real_player_id)
        s.squad_id as draft_id,
        s.real_player_id,
        s.player_name,
        s.position,
        s.real_team_name as team,
        s.purchase_price as draft_price,
        s.total_points,
        s.is_captain,
        s.is_vice_captain,
        d.draft_order
      FROM fantasy_squad s
      LEFT JOIN fantasy_drafts d 
        ON d.league_id = ${leagueId} 
        AND d.team_id = ${teamId}
        AND d.real_player_id = s.real_player_id
      WHERE s.team_id = ${teamId}
      ORDER BY s.real_player_id, d.draft_order ASC NULLS LAST, s.acquired_at ASC
    `;

    // Get points breakdown for each player
    const draftedPlayers = await Promise.all(
      squadPlayers.map(async (player: any) => {
        // Get player's match-by-match points
        const playerPoints = await fantasySql`
          SELECT 
            COUNT(*) as matches_played,
            SUM(total_points) as total_points
          FROM fantasy_player_points
          WHERE team_id = ${teamId}
            AND real_player_id = ${player.real_player_id}
        `;

        const matchesPlayed = Number(playerPoints[0]?.matches_played || 0);
        const totalPoints = Number(playerPoints[0]?.total_points || player.total_points || 0);
        const averagePoints = matchesPlayed > 0 ? totalPoints / matchesPlayed : 0;

        return {
          draft_id: player.draft_id,
          real_player_id: player.real_player_id,
          player_name: player.player_name,
          position: player.position || 'Unknown',
          team: player.team || 'Unknown',
          draft_price: Number(player.draft_price),
          draft_order: player.draft_order || 0,
          total_points: totalPoints,
          matches_played: matchesPlayed,
          average_points: Math.round(averagePoints * 10) / 10,
          is_captain: player.is_captain,
          is_vice_captain: player.is_vice_captain,
        };
      })
    );

    // Get recent points (last 5 rounds) from PostgreSQL
    const recentRounds = await fantasySql`
      SELECT 
        round_number as round,
        SUM(total_points) as points
      FROM fantasy_player_points
      WHERE team_id = ${teamId}
        AND round_number IS NOT NULL
      GROUP BY round_number
      ORDER BY round_number DESC
      LIMIT 5
    `;

    // Convert to expected format
    const formattedRounds = recentRounds.map((r: any) => ({
      round: Number(r.round),
      points: Number(r.points),
    }));

    let teamLogo = null;
    let logo_position_x_circle = null;
    let logo_position_y_circle = null;
    let logo_scale_circle = null;
    let logo_position_x_square = null;
    let logo_position_y_square = null;
    let logo_scale_square = null;
    if (teamData.supported_team_id) {
      const baseTeamId = teamData.supported_team_id.split('_')[0];
      try {
        const mainSql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);
        const teamRows = await mainSql`SELECT logo_url, logo_position_x_circle, logo_position_y_circle, logo_scale_circle, logo_position_x_square, logo_position_y_square, logo_scale_square FROM teams WHERE id = ${baseTeamId} LIMIT 1`;
        if (teamRows && teamRows.length > 0) {
          const teamRow = teamRows[0] as any;
          teamLogo = teamRow.logo_url || null;
          logo_position_x_circle = teamRow.logo_position_x_circle || null;
          logo_position_y_circle = teamRow.logo_position_y_circle || null;
          logo_scale_circle = teamRow.logo_scale_circle || null;
          logo_position_x_square = teamRow.logo_position_x_square || null;
          logo_position_y_square = teamRow.logo_position_y_square || null;
          logo_scale_square = teamRow.logo_scale_square || null;
        }
      } catch (error) {
        console.error('Error fetching team logo:', error);
      }
    }

    return NextResponse.json({
      success: true,
      team: {
        id: teamId,
        fantasy_league_id: leagueId,
        team_name: teamData.team_name,
        total_points: Number(teamData.total_points) || 0,
        rank: teamData.rank,
        player_count: draftedPlayers.length,
        supported_team_id: teamData.supported_team_id || null,
        supported_team_name: teamData.supported_team_name || null,
        supported_team_logo: teamLogo,
        logo_position_x_circle,
        logo_position_y_circle,
        logo_scale_circle,
        logo_position_x_square,
        logo_position_y_square,
        logo_scale_square,
        passive_points: Number(teamData.passive_points) || 0,
        draft_submitted: teamData.draft_submitted || false,
        budget_remaining: Number(teamData.budget_remaining) || 0,
      },
      players: draftedPlayers,
      recent_rounds: formattedRounds,
    });
  } catch (error) {
    console.error('Error fetching my fantasy team:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fantasy team' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fantasy/teams/my-team
 * Register the current user for the fantasy league
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, league_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Get user/team info from Firebase
    const userDoc = await adminDb.collection('users').doc(user_id).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data()!;
    const teamName = userData.teamName || userData.username || 'Team';
    // Get owner's actual name (firstName + lastName or username as fallback)
    const ownerActualName = userData.firstName && userData.lastName 
      ? `${userData.firstName} ${userData.lastName}`.trim()
      : userData.firstName || userData.username || teamName;

    // If league_id not provided, get current season
    let finalLeagueId = league_id;
    if (!finalLeagueId) {
      const tournamentSql = getTournamentDb();
      const primaryTournaments = await tournamentSql`
        SELECT season_id FROM tournaments
        WHERE is_primary = true
        AND status IN ('active', 'upcoming')
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (primaryTournaments.length === 0) {
        return NextResponse.json(
          { error: 'No active season found' },
          { status: 404 }
        );
      }

      const seasonId = primaryTournaments[0].season_id;
      const seasonNumber = seasonId.replace('SSPSLS', '');
      finalLeagueId = `SSPSLFLS${seasonNumber}`;
    }

    // Check if fantasy team already exists (by owner_uid)
    const existingTeams = await fantasySql`
      SELECT * FROM fantasy_teams
      WHERE owner_uid = ${user_id} AND league_id = ${finalLeagueId}
      LIMIT 1
    `;

    if (existingTeams.length > 0) {
      return NextResponse.json(
        { 
          success: true,
          already_registered: true,
          message: 'You are already registered for this fantasy league',
          team_id: existingTeams[0].team_id
        },
        { status: 200 }
      );
    }

    // Fallback: check by team_id via Firebase (handles blank owner_uid from enable-all)
    const teamsSnap = await adminDb.collection('teams')
      .where('uid', '==', user_id)
      .limit(1)
      .get();

    if (!teamsSnap.empty) {
      const firebaseTeamId = teamsSnap.docs[0].id;
      const existingByTeamId = await fantasySql`
        SELECT * FROM fantasy_teams
        WHERE team_id = ${firebaseTeamId} AND league_id = ${finalLeagueId}
        LIMIT 1
      `;
      if (existingByTeamId.length > 0) {
        // Self-heal owner_uid and return success
        await fantasySql`
          UPDATE fantasy_teams
          SET owner_uid = ${user_id}, updated_at = NOW()
          WHERE team_id = ${firebaseTeamId}
        `;
        return NextResponse.json(
          { 
            success: true,
            already_registered: true,
            message: 'You are already registered for this fantasy league',
            team_id: existingByTeamId[0].team_id
          },
          { status: 200 }
        );
      }
    }

    // Get team ID from Firebase team_seasons or teams collection
    let teamDocId = null;
    
    // First try to get from current season's team_seasons
    const seasonId = finalLeagueId.replace('SSPSLFLS', 'SSPSLS');
    const teamSeasonsQuery = await adminDb.collection('team_seasons')
      .where('user_id', '==', user_id)
      .where('season_id', '==', seasonId)
      .where('status', '==', 'registered')
      .limit(1)
      .get();
    
    if (!teamSeasonsQuery.empty) {
      teamDocId = teamSeasonsQuery.docs[0].data().team_id;
    } else {
      // Fallback to teams collection
      const teamsQuery = await adminDb.collection('teams')
        .where('uid', '==', user_id)
        .limit(1)
        .get();
      
      if (!teamsQuery.empty) {
        teamDocId = teamsQuery.docs[0].id;
      }
    }
    
    if (!teamDocId) {
      return NextResponse.json(
        { error: 'No team found for user. Please register for the season first.' },
        { status: 404 }
      );
    }
    
    const fantasyTeamId = teamDocId;

    // Get league budget
    let budgetPerTeam = 500.00;
    const leagueResult = await fantasySql`
      SELECT budget_per_team FROM fantasy_leagues 
      WHERE league_id = ${finalLeagueId}
      LIMIT 1
    `;
    
    if (leagueResult.length === 0) {
      // Auto-initialize fantasy league if missing
      const seasonId = finalLeagueId.replace('SSPSLFLS', 'SSPSLS');
      const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
      const seasonData = seasonDoc.data();
      const seasonName = seasonData?.description || seasonData?.season_number || seasonId;

      const defaultCategorySettings = {
        slots: [
          { slot_index: 1, name: 'Red Slot 1', list_id: 'red_list_1', base_price: 20 },
          { slot_index: 2, name: 'Red Slot 2', list_id: 'red_list_2', base_price: 15 },
          { slot_index: 3, name: 'Blue Slot', list_id: 'blue_list', base_price: 10 },
          { slot_index: 4, name: 'Black Slot', list_id: 'black_list', base_price: 5 },
          { slot_index: 5, name: 'White Slot', list_id: 'white_list', base_price: 3 },
          { slot_index: 6, name: 'Real Team Slot', list_id: 'real_team_list', base_price: 25 }
        ],
        lists: {
          red_list_1: [],
          red_list_2: [],
          blue_list: [],
          black_list: [],
          white_list: [],
          real_team_list: []
        },
        max_bids_per_team: 10
      };

      await fantasySql`
        INSERT INTO fantasy_leagues (
          league_id, season_id, season_name, league_name,
          budget_per_team, max_squad_size, max_transfers_per_window, points_cost_per_transfer,
          category_settings
        ) VALUES (
          ${finalLeagueId}, ${seasonId}, ${seasonName}, ${'Fantasy League - ' + seasonName},
          500.00, 7, 2, 4,
          ${JSON.stringify(defaultCategorySettings)}
        )
      `;
    } else {
      budgetPerTeam = Number(leagueResult[0].budget_per_team) || 500.00;
    }
    
    // Create fantasy team in PostgreSQL
    await fantasySql`
      INSERT INTO fantasy_teams (
        team_id,
        league_id,
        real_team_id,
        real_team_name,
        team_name,
        owner_uid,
        owner_name,
        budget_remaining,
        total_points,
        rank,
        is_enabled,
        created_at,
        updated_at
      ) VALUES (
        ${fantasyTeamId},
        ${finalLeagueId},
        ${teamDocId},
        ${teamName},
        ${teamName},
        ${user_id},
        ${ownerActualName},
        ${budgetPerTeam},
        0,
        999,
        true,
        NOW(),
        NOW()
      )
    `;

    // Update Firebase team document if it exists
    const teamDoc = await adminDb.collection('teams').doc(teamDocId).get();
    if (teamDoc.exists) {
      await adminDb.collection('teams').doc(teamDocId).update({
        fantasy_participating: true,
        fantasy_league_id: finalLeagueId,
        updated_at: new Date()
      });
    }

    console.log(`✅ Fantasy team registered: ${fantasyTeamId} for ${teamName}`);

    return NextResponse.json({
      success: true,
      message: 'Successfully registered for fantasy league!',
      team: {
        id: fantasyTeamId,
        league_id: finalLeagueId,
        team_name: teamName,
        total_points: 0,
        rank: 999,
        player_count: 0
      }
    });
  } catch (error) {
    console.error('Error registering fantasy team:', error);
    return NextResponse.json(
      { error: 'Failed to register fantasy team', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
