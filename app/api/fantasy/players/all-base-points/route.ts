import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getPlayerPhotosMap } from '@/lib/fantasy/photos';

/**
 * GET /api/fantasy/players/all-base-points?league_id=xxx&round_id=xxx&page=1&page_size=50
 * Get ALL players (drafted and undrafted) with their base points for a specific round.
 * Player name, team, position and category are fetched from fantasy_players directly.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const roundId = searchParams.get('round_id');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get('page_size') || '50', 10)));
    const offset = (page - 1) * pageSize;

    if (!leagueId) {
      return NextResponse.json(
        { error: 'Missing required parameter: league_id' },
        { status: 400 }
      );
    }

    // Get total counts for stats (full dataset, not paginated)
    const countResult = await fantasySql`
      SELECT
        COUNT(*)::int                                      AS total,
        COUNT(*) FILTER (WHERE is_available = true)::int  AS available,
        (SELECT COUNT(*)::int FROM fantasy_squad WHERE league_id = ${leagueId})::int AS drafted
      FROM fantasy_players
      WHERE league_id = ${leagueId}
    `;
    const totalPlayers    = countResult[0]?.total     ?? 0;
    const totalAvailable  = countResult[0]?.available ?? 0;
    const totalDrafted    = countResult[0]?.drafted   ?? 0;

    // Get players — use sql unsafe for LIMIT/OFFSET with dynamic ints
    // (Neon HTTP driver supports parameterized LIMIT but casting ensures correctness)
    const players = await fantasySql`
      SELECT 
        fp.real_player_id,
        fp.player_name,
        fp.real_team_name,
        fp.category,
        fp.is_available,
        fp.total_points as cumulative_points,
        fp.draft_price,
        fs.team_id as acquired_by_team_id,
        ft.team_name as acquired_by_team_name,
        ft.owner_name as acquired_by_owner
      FROM fantasy_players fp
      LEFT JOIN fantasy_squad fs ON fs.real_player_id = fp.real_player_id 
        AND fs.league_id = fp.league_id
      LEFT JOIN fantasy_teams ft ON ft.team_id = fs.team_id
      WHERE fp.league_id = ${leagueId}
      ORDER BY fp.total_points DESC, fp.player_name ASC
      LIMIT ${pageSize}::int OFFSET ${offset}::int
    `;

    // If round_id provided, get round-specific base points
    let roundPointsMap: Record<string, any> = {};
    if (roundId) {
      const roundPoints = await fantasySql`
        SELECT 
          fpp.real_player_id,
          fpp.player_name,
          fpp.base_points,
          rp.goals,
          rp.assists,
          rp.clean_sheet,
          rp.motm,
          rp.minutes_played,
          rp.real_team_name as rp_real_team_name,
          rp.position as rp_position
        FROM fantasy_player_points fpp
        LEFT JOIN round_players rp ON rp.real_player_id = fpp.real_player_id 
          AND rp.round_id = ${roundId}
        WHERE fpp.league_id = ${leagueId}
          AND fpp.fantasy_round_id = ${roundId}
          AND fpp.team_id IS NULL
      `;

      roundPoints.forEach((rp: any) => {
        roundPointsMap[rp.real_player_id] = rp;
      });
    }

    // Fetch photos
    const photosMap = await getPlayerPhotosMap();

    // Combine data — always prefer fantasy_players fields for name/team/position/category
    const playersWithPoints = players.map((player: any) => {
      const roundData = roundPointsMap[player.real_player_id];

      return {
        real_player_id: player.real_player_id,
        player_name: player.player_name || roundData?.player_name || 'Unknown',
        position: player.position || roundData?.rp_position || null,
        real_team_name: player.real_team_name || roundData?.rp_real_team_name || null,
        category: player.category || null,
        draft_price: Number(player.draft_price || 0),
        photo_url: photosMap[player.real_player_id] || null,

        is_available: player.is_available,
        acquired_by_team_id: player.acquired_by_team_id || null,
        acquired_by_team_name: player.acquired_by_team_name || null,
        acquired_by_owner: player.acquired_by_owner || null,

        cumulative_base_points: Number(player.cumulative_points || 0),
        round_base_points: roundData ? Number(roundData.base_points || 0) : null,

        round_stats: roundData ? {
          goals: Number(roundData.goals || 0),
          assists: Number(roundData.assists || 0),
          clean_sheet: roundData.clean_sheet || false,
          motm: roundData.motm || false,
          minutes_played: Number(roundData.minutes_played || 0),
        } : null,
      };
    });

    // Get round info if provided
    let roundInfo = null;
    if (roundId) {
      const roundRows = await fantasySql`
        SELECT 
          fantasy_round_id,
          round_id,
          round_number,
          round_name,
          is_completed
        FROM fantasy_rounds
        WHERE league_id = ${leagueId}
          AND round_id = ${roundId}
        LIMIT 1
      `;
      roundInfo = roundRows[0] || null;
    }

    return NextResponse.json({
      success: true,
      league_id: leagueId,
      round_id: roundId,
      round_info: roundInfo,
      players: playersWithPoints,
      pagination: {
        page,
        page_size: pageSize,
        total_players: totalPlayers,
        total_pages: Math.max(1, Math.ceil(totalPlayers / pageSize)),
        has_next: page * pageSize < totalPlayers,
        has_prev: page > 1,
      },
      total_players: totalPlayers,
      available_players: totalAvailable,
      drafted_players: totalDrafted,
    });
  } catch (error: any) {
    console.error('Error fetching all players base points:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch all players base points', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
