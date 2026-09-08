import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getPlayerPhotosMap } from '@/lib/fantasy/photos';

/**
 * GET /api/fantasy/teams/[teamId]
 * Get fantasy team details with drafted players and points history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    console.log('[Team API] Fetching team with ID:', teamId);

    if (!teamId) {
      console.error('[Team API] Team ID is missing');
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

    // Get fantasy team from PostgreSQL
    const teams = await fantasySql`
      SELECT * FROM fantasy_teams
      WHERE team_id = ${teamId}
      LIMIT 1
    `;

    console.log('[Team API] Teams found:', teams.length);

    if (teams.length === 0) {
      console.error('[Team API] Fantasy team not found for ID:', teamId);
      return NextResponse.json(
        { error: 'Fantasy team not found' },
        { status: 404 }
      );
    }

    const teamData = teams[0];
    console.log('[Team API] Team data:', { team_id: teamData.team_id, team_name: teamData.team_name });

    // Get squad players from fantasy_squad (current active squad)
    const squadPlayers = await fantasySql`
      SELECT 
        fs.squad_id,
        fs.real_player_id,
        fs.player_name,
        COALESCE(fp.category, fs.position, 'Unknown') as category,
        fs.position,
        fs.real_team_name,
        fs.purchase_price,
        fs.total_points,
        fs.is_captain,
        fs.is_vice_captain,
        fs.acquired_at
      FROM fantasy_squad fs
      LEFT JOIN fantasy_players fp ON (fs.real_player_id = fp.real_player_id AND fs.league_id = fp.league_id)
      WHERE fs.team_id = ${teamId}
      ORDER BY fs.total_points DESC
    `;

    console.log('[Team API] Squad players found:', squadPlayers.length);

    // Build player sub-group map from league category_settings
    const playerSubgroupMap: Record<string, string> = {};
    if (squadPlayers.length > 0 && (teamData.league_id || teamData.fantasy_league_id)) {
      try {
        const targetLeagueId = teamData.league_id || teamData.fantasy_league_id;
        const leagues = await fantasySql`
          SELECT category_settings FROM fantasy_leagues
          WHERE league_id = ${targetLeagueId}
          LIMIT 1
        `;
        if (leagues.length > 0 && leagues[0].category_settings) {
          const cs = typeof leagues[0].category_settings === 'string'
            ? JSON.parse(leagues[0].category_settings)
            : leagues[0].category_settings;
          const slotNameMap: Record<string, string> = {};
          (cs.slots || []).forEach((s: any) => {
            slotNameMap[s.list_id] = s.name;
          });
          if (cs.lists) {
            Object.entries(cs.lists).forEach(([listId, pids]: [string, any]) => {
              const subName = slotNameMap[listId] || listId;
              if (Array.isArray(pids)) {
                pids.forEach((pid: string) => {
                  playerSubgroupMap[pid] = subName;
                });
              }
            });
          }
        }
      } catch (e) {
        console.error('Error resolving category subgroups in team API:', e);
      }
    }

    // Fetch player photos map
    const photosMap = await getPlayerPhotosMap();

    // Get match statistics for each player
    const draftedPlayers = await Promise.all(
      squadPlayers.map(async (player: any) => {
        // Get player's match history
        const matches = await fantasySql`
          SELECT 
            COUNT(*) as matches_played,
            COALESCE(SUM(total_points), 0) as total_match_points
          FROM fantasy_player_points
          WHERE team_id = ${teamId}
            AND real_player_id = ${player.real_player_id}
        `;

        const matchesPlayed = Number(matches[0]?.matches_played || 0);
        const rawBasePoints = Number(matches[0]?.total_match_points || 0);
        const multiplier = player.is_captain ? 2.0 : (player.is_vice_captain ? 1.5 : 1.0);
        const totalPoints = player.total_points && Number(player.total_points) > 0
          ? Number(player.total_points)
          : Math.round(rawBasePoints * multiplier);
        const averagePoints = matchesPlayed > 0 ? totalPoints / matchesPlayed : 0;

        return {
          draft_id: player.squad_id,
          real_player_id: player.real_player_id,
          player_name: player.player_name,
          category: playerSubgroupMap[player.real_player_id] || player.category || 'Unknown',
          position: player.position,
          real_team_name: player.real_team_name,
          purchase_price: Number(player.purchase_price),
          total_points: totalPoints,
          matches_played: matchesPlayed,
          average_points: Math.round(averagePoints * 10) / 10,
          is_captain: player.is_captain,
          is_vice_captain: player.is_vice_captain,
          photo_url: photosMap[player.real_player_id] || null,
        };
      })
    );

    // Get recent points by round (last 5 rounds)
    const recentPoints = await fantasySql`
      SELECT 
        fpp.round_number,
        SUM(fpp.total_points) as points
      FROM fantasy_player_points fpp
      JOIN fantasy_squad fs ON fpp.real_player_id = fs.real_player_id AND fs.team_id = ${teamId}
      GROUP BY fpp.round_number
      ORDER BY fpp.round_number DESC
      LIMIT 5
    `;

    const recentRounds = recentPoints.map((r: any) => ({
      round: r.round_number,
      points: Number(r.points),
    }));

    return NextResponse.json({
      success: true,
      team: {
        id: teamData.team_id,
        team_name: teamData.team_name,
        owner_name: teamData.owner_name,
        total_points: teamData.total_points,
        rank: teamData.rank,
        budget_remaining: Number(teamData.budget_remaining || 0),
      },
      players: draftedPlayers,
      recent_rounds: recentRounds,
      statistics: {
        total_players: draftedPlayers.length,
        total_points: teamData.total_points || 0,
        average_points_per_player: draftedPlayers.length > 0 
          ? Math.round((teamData.total_points || 0) / draftedPlayers.length * 10) / 10 
          : 0,
      }
    });
  } catch (error: any) {
    console.error('[Team API] Error fetching fantasy team:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fantasy team', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
