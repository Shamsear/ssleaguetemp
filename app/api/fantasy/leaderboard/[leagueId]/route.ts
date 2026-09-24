import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * GET /api/fantasy/leaderboard/[leagueId]
 * Get fantasy league leaderboard with team rankings from PostgreSQL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params;

    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID is required' },
        { status: 400 }
      );
    }

    const fantasySql = getFantasyDb();

    // Get fantasy league
    const leagues = await fantasySql`
      SELECT id, league_id, league_name, season_id, is_active
      FROM fantasy_leagues
      WHERE league_id = ${leagueId}
    `;

    if (leagues.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy league not found' },
        { status: 404 }
      );
    }

    const league = leagues[0];

    const url = new URL(request.url);
    const maxRoundParam = url.searchParams.get('max_round') || url.searchParams.get('round');
    const maxRound = maxRoundParam && !isNaN(Number(maxRoundParam)) ? Number(maxRoundParam) : null;

    // Fetch available completed rounds
    const availableRoundsData = await fantasySql`
      SELECT DISTINCT round_number
      FROM (
        SELECT round_number FROM fantasy_player_points WHERE league_id = ${leagueId}
        UNION
        SELECT round_number FROM fantasy_team_bonus_points WHERE league_id = ${leagueId}
      ) combined
      ORDER BY round_number ASC
    `;
    const availableRounds = availableRoundsData.map((r: any) => Number(r.round_number));

    let leaderboard: any[] = [];

    if (maxRound !== null) {
      // Get leaderboard aggregated up to maxRound
      leaderboard = await fantasySql`
        WITH player_pts AS (
          SELECT team_id, COALESCE(SUM(total_points), 0) as calc_player_points
          FROM fantasy_player_points
          WHERE league_id = ${leagueId} AND round_number <= ${maxRound}
          GROUP BY team_id
        ),
        passive_pts AS (
          SELECT team_id, COALESCE(SUM(total_bonus), 0) as calc_passive_points
          FROM fantasy_team_bonus_points
          WHERE league_id = ${leagueId} AND round_number <= ${maxRound}
          GROUP BY team_id
        ),
        last_rd_pts AS (
          SELECT fpp.team_id, COALESCE(SUM(fpp.total_points), 0) as calc_last_round_points
          FROM fantasy_player_points fpp
          WHERE fpp.league_id = ${leagueId} AND fpp.round_number = ${maxRound}
          GROUP BY fpp.team_id
        ),
        combined_scores AS (
          SELECT 
            ft.team_id as fantasy_team_id,
            ft.team_name,
            ft.owner_name,
            COALESCE(pt.calc_player_points, 0) as player_points,
            COALESCE(pas.calc_passive_points, 0) as passive_points,
            (COALESCE(pt.calc_player_points, 0) + COALESCE(pas.calc_passive_points, 0)) as total_points,
            COALESCE(lrd.calc_last_round_points, 0) as last_round_points,
            COALESCE(
              (
                SELECT ftbp.real_team_id
                FROM fantasy_team_bonus_points ftbp
                WHERE ftbp.league_id = ${leagueId} AND ftbp.team_id = ft.team_id AND ftbp.round_number <= ${maxRound}
                ORDER BY ftbp.round_number DESC, ftbp.id DESC
                LIMIT 1
              ),
              ft.supported_team_id
            ) as supported_team_id,
            COALESCE(
              (
                SELECT ftbp.real_team_name
                FROM fantasy_team_bonus_points ftbp
                WHERE ftbp.league_id = ${leagueId} AND ftbp.team_id = ft.team_id AND ftbp.round_number <= ${maxRound}
                ORDER BY ftbp.round_number DESC, ftbp.id DESC
                LIMIT 1
              ),
              ft.supported_team_name
            ) as supported_team_name,
            COUNT(DISTINCT fs.real_player_id) as player_count
          FROM fantasy_teams ft
          LEFT JOIN player_pts pt ON ft.team_id = pt.team_id
          LEFT JOIN passive_pts pas ON ft.team_id = pas.team_id
          LEFT JOIN last_rd_pts lrd ON ft.team_id = lrd.team_id
          LEFT JOIN fantasy_squad fs ON ft.team_id = fs.team_id
          WHERE ft.league_id = ${leagueId}
          GROUP BY ft.team_id, ft.team_name, ft.owner_name, pt.calc_player_points, pas.calc_passive_points, lrd.calc_last_round_points, ft.supported_team_id, ft.supported_team_name
        )
        SELECT 
          cs.*,
          ROW_NUMBER() OVER (ORDER BY cs.total_points DESC, cs.team_name ASC) as rank
        FROM combined_scores cs
        ORDER BY cs.total_points DESC, cs.team_name ASC
      `;
    } else {
      // Get standard all-time leaderboard with team stats
      leaderboard = await fantasySql`
        SELECT 
          ft.team_id as fantasy_team_id,
          ft.team_name,
          ft.owner_name,
          ft.total_points,
          COALESCE(ft.passive_points, 0) as passive_points,
          COALESCE(
            ft.player_points,
            (
              SELECT COALESCE(SUM(fs.total_points), 0)
              FROM fantasy_squad fs
              WHERE fs.team_id = ft.team_id
            ),
            0
          ) as player_points,
          ft.rank,
          COALESCE(
            (
              SELECT ftbp.real_team_id
              FROM fantasy_team_bonus_points ftbp
              WHERE ftbp.league_id = ${leagueId} AND ftbp.team_id = ft.team_id
              ORDER BY ftbp.round_number DESC, ftbp.id DESC
              LIMIT 1
            ),
            ft.supported_team_id
          ) as supported_team_id,
          COALESCE(
            (
              SELECT ftbp.real_team_name
              FROM fantasy_team_bonus_points ftbp
              WHERE ftbp.league_id = ${leagueId} AND ftbp.team_id = ft.team_id
              ORDER BY ftbp.round_number DESC, ftbp.id DESC
              LIMIT 1
            ),
            ft.supported_team_name
          ) as supported_team_name,
          COUNT(DISTINCT fs.real_player_id) as player_count,
          COALESCE(
            (
              SELECT SUM(fpp.total_points)
              FROM fantasy_player_points fpp
              JOIN fantasy_squad fs ON fpp.real_player_id = fs.real_player_id AND fs.team_id = ft.team_id
              WHERE fpp.league_id = ${leagueId}
                AND fpp.round_number = (
                  SELECT MAX(round_number)
                  FROM fantasy_player_points
                  WHERE league_id = ${leagueId}
                )
            ),
            0
          ) as last_round_points
        FROM fantasy_teams ft
        LEFT JOIN fantasy_squad fs ON ft.team_id = fs.team_id
        WHERE ft.league_id = ${leagueId}
        GROUP BY ft.team_id, ft.team_name, ft.owner_name, ft.total_points, ft.passive_points, ft.player_points, ft.rank, ft.supported_team_id, ft.supported_team_name, ft.league_id
        ORDER BY ft.total_points DESC, ft.rank ASC NULLS LAST, ft.team_name ASC
      `;
    }

    // Get fantasy team logos from Firebase using fantasy team_id
    const fantasyTeamIds = leaderboard
      .map((entry: any) => entry.fantasy_team_id)
      .filter((id: any) => id != null && id !== '');
    
    console.log('[Leaderboard API] Fetching logos for fantasy team IDs:', fantasyTeamIds);
    
    let teamLogos: Record<string, any> = {};
    if (fantasyTeamIds.length > 0) {
      // Fetch fantasy teams by document ID (fantasy team_id)
      const teamPromises = fantasyTeamIds.map((teamId: any) => 
        adminDb.collection('teams').doc(teamId).get()
      );
      
      const teamDocs = await Promise.all(teamPromises);
      
      teamDocs.forEach((doc, index) => {
        const fantasyTeamId = fantasyTeamIds[index];
        if (doc.exists) {
          const teamData = doc.data();
          const logoUrl = teamData?.logo_url || teamData?.logoUrl || teamData?.logo || teamData?.team_logo || teamData?.url || null;
          
          if (logoUrl) {
            teamLogos[fantasyTeamId] = {
              logo_url: logoUrl,
              logo_position_x_circle: teamData?.logo_position_x_circle,
              logo_position_y_circle: teamData?.logo_position_y_circle,
              logo_scale_circle: teamData?.logo_scale_circle,
              logo_position_x_square: teamData?.logo_position_x_square,
              logo_position_y_square: teamData?.logo_position_y_square,
              logo_scale_square: teamData?.logo_scale_square,
            };
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      league: {
        id: league.id,
        league_id: league.league_id,
        name: league.league_name,
        season_id: league.season_id,
        status: league.is_active ? 'active' : 'inactive',
      },
      available_rounds: availableRounds,
      selected_max_round: maxRound,
      leaderboard: leaderboard.map((entry: any) => ({
        id: entry.fantasy_team_id,
        rank: Number(entry.rank) || 999,
        fantasy_team_id: entry.fantasy_team_id,
        team_name: entry.team_name,
        owner_name: entry.owner_name,
        total_points: Number(entry.total_points) || 0,
        player_points: Number(entry.player_points) || 0,
        passive_points: Number(entry.passive_points) || 0,
        player_count: Number(entry.player_count) || 0,
        last_round_points: Number(entry.last_round_points) || 0,
        supported_team_id: entry.supported_team_id || null,
        supported_team_name: entry.supported_team_name || null,
        team_logo: teamLogos[entry.fantasy_team_id]?.logo_url || null,
        logo_position_x_circle: teamLogos[entry.fantasy_team_id]?.logo_position_x_circle,
        logo_position_y_circle: teamLogos[entry.fantasy_team_id]?.logo_position_y_circle,
        logo_scale_circle: teamLogos[entry.fantasy_team_id]?.logo_scale_circle,
        logo_position_x_square: teamLogos[entry.fantasy_team_id]?.logo_position_x_square,
        logo_position_y_square: teamLogos[entry.fantasy_team_id]?.logo_position_y_square,
        logo_scale_square: teamLogos[entry.fantasy_team_id]?.logo_scale_square,
      })),
      total_teams: leaderboard.length,
    });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
