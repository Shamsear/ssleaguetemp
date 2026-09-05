import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const teamName = searchParams.get('teamName');

    if (!teamId && !teamName) {
      return NextResponse.json(
        { success: false, error: 'Either teamId or teamName is required' },
        { status: 400 }
      );
    }

    let teamData: any = null;

    if (teamId) {
      // Get team by ID
      const querySnapshot = await adminDb.collection('teams').where('id', '==', teamId).get();
      
      if (!querySnapshot.empty) {
        teamData = querySnapshot.docs[0].data();
      }
    } else if (teamName) {
      // Get team by name
      const querySnapshot = await adminDb.collection('teams').where('team_name', '==', teamName).get();
      
      if (!querySnapshot.empty) {
        teamData = querySnapshot.docs[0].data();
      }
    }

    if (!teamData) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    // Get players for this team across all seasons
    const playersSnapshot = await adminDb.collection('real_players').where('team_name', '==', teamData.team_name).get();

    const playersBySeasons = new Map();
    const playersList: any[] = [];

    playersSnapshot.docs.forEach((playerDoc: any) => {
      const playerData = playerDoc.data();
      playersList.push(playerData);
      
      // Group players by seasons
      const seasonId = playerData.season_id;
      if (!playersBySeasons.has(seasonId)) {
        playersBySeasons.set(seasonId, []);
      }
      playersBySeasons.get(seasonId).push(playerData);
    });

    // Get season names for each season the team participated in
    const seasonDetails: any = {};
    for (const seasonId of teamData.seasons || []) {
      try {
        const sql = getTournamentDb();
        const seasonRows = await sql`SELECT * FROM seasons WHERE id = ${seasonId} LIMIT 1`;
        if (seasonRows.length > 0) {
          seasonDetails[seasonId] = {
            name: seasonRows[0].name,
            short_name: seasonRows[0].short_name,
            status: seasonRows[0].status,
            created_at: seasonRows[0].created_at ? new Date(seasonRows[0].created_at) : null
          };
        }
      } catch (error: any) {
        console.warn(`Failed to get season details for ${seasonId}:`, error);
        seasonDetails[seasonId] = { name: 'Unknown Season', short_name: 'Unknown' };
      }
    }

    // Calculate aggregated statistics across all seasons
    const aggregatedStats = {
      total_players: playersList.length,
      total_goals: 0,
      total_points: 0,
      total_matches: 0,
      total_wins: 0,
      total_draws: 0,
      total_losses: 0,
      total_cleansheets: 0,
      seasons_participated: teamData.total_seasons_participated || teamData.seasons?.length || 0
    };

    playersList.forEach(player => {
      aggregatedStats.total_goals += player.career_stats?.total_goals_scored || 0;
      aggregatedStats.total_points += player.career_stats?.total_points || 0;
      aggregatedStats.total_matches = Math.max(aggregatedStats.total_matches, player.career_stats?.total_matches || 0);
      aggregatedStats.total_wins += player.career_stats?.total_wins || 0;
      aggregatedStats.total_draws += player.career_stats?.total_draws || 0;
      aggregatedStats.total_losses += player.career_stats?.total_losses || 0;
      aggregatedStats.total_cleansheets += player.career_stats?.total_cleansheets || 0;
    });

    return NextResponse.json({
      success: true,
      team: {
        id: teamData.id,
        team_name: teamData.team_name,
        owner_name: teamData.owner_name,
        username: teamData.username,
        is_active: teamData.is_active,
        created_at: teamData.created_at?.toDate?.() || null
      },
      performance: {
        aggregated_stats: aggregatedStats,
        performance_history: teamData.performance_history || {},
        season_details: seasonDetails,
        players_by_season: Object.fromEntries(playersBySeasons),
        all_players: playersList
      }
    });

  } catch (error: any) {
    console.error('Error fetching team performance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch team performance data' },
      { status: 500 }
    );
  }
}

// POST endpoint to get performance data for multiple teams
export async function POST(request: NextRequest) {
  try {
    const { teamIds, teamNames, seasonId } = await request.json();

    if ((!teamIds || teamIds.length === 0) && (!teamNames || teamNames.length === 0)) {
      return NextResponse.json(
        { success: false, error: 'Either teamIds or teamNames array is required' },
        { status: 400 }
      );
    }

    let querySnapshot: any;

    if (teamIds && teamIds.length > 0) {
      querySnapshot = await adminDb.collection('teams').where('id', 'in', teamIds).get();
    } else {
      querySnapshot = await adminDb.collection('teams').where('team_name', 'in', teamNames).get();
    }

    const teamsPerformance = [];

    for (const teamDoc of querySnapshot.docs) {
      const teamData = teamDoc.data();
      
      let playersSnapshot: any;
      
      if (seasonId) {
        playersSnapshot = await adminDb.collection('real_players')
          .where('team_name', '==', teamData.team_name)
          .where('season_id', '==', seasonId)
          .get();
      } else {
        playersSnapshot = await adminDb.collection('real_players')
          .where('team_name', '==', teamData.team_name)
          .get();
      }
      
      const players = playersSnapshot.docs.map((doc: any) => doc.data());

      teamsPerformance.push({
        team: {
          id: teamData.id,
          team_name: teamData.team_name,
          owner_name: teamData.owner_name,
          username: teamData.username
        },
        players_count: players.length,
        players: players,
        performance_history: seasonId ? 
          { [seasonId]: teamData.performance_history?.[seasonId] || null } : 
          teamData.performance_history || {}
      });
    }

    return NextResponse.json({
      success: true,
      teams_performance: teamsPerformance
    });

  } catch (error: any) {
    console.error('Error fetching multiple teams performance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch teams performance data' },
      { status: 500 }
    );
  }
}