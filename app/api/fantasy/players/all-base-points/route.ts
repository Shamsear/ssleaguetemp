import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/players/all-base-points?league_id=xxx&round_id=xxx
 * Get ALL players (drafted and undrafted) with their base points for a specific round
 * Shows which team has acquired each player (if any)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const roundId = searchParams.get('round_id');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'Missing required parameter: league_id' },
        { status: 400 }
      );
    }

    // Get all players in the league with their ownership status
    const players = await fantasySql`
      SELECT 
        fp.real_player_id,
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
      ORDER BY fp.total_points DESC, fp.real_player_id
    `;

    // If round_id provided, get round-specific base points
    let roundPointsMap: Record<string, any> = {};
    if (roundId) {
      const roundPoints = await fantasySql`
        SELECT 
          fpp.real_player_id,
          fpp.player_name,
          fpp.base_points,
          fpp.recorded_at,
          rp.goals,
          rp.assists,
          rp.clean_sheet,
          rp.motm,
          rp.minutes_played,
          rp.real_team_name,
          rp.position
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

    // Combine data
    const playersWithPoints = players.map((player: any) => {
      const roundData = roundPointsMap[player.real_player_id];
      
      return {
        real_player_id: player.real_player_id,
        player_name: roundData?.player_name || 'Unknown',
        position: roundData?.position || null,
        real_team_name: roundData?.real_team_name || null,
        draft_price: Number(player.draft_price || 0),
        
        // Ownership info
        is_available: player.is_available,
        acquired_by_team_id: player.acquired_by_team_id || null,
        acquired_by_team_name: player.acquired_by_team_name || null,
        acquired_by_owner: player.acquired_by_owner || null,
        
        // Points info
        cumulative_base_points: Number(player.cumulative_points || 0),
        round_base_points: roundData ? Number(roundData.base_points || 0) : null,
        
        // Round performance (if available)
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
      const [round] = await fantasySql`
        SELECT 
          fantasy_round_id,
          round_id,
          round_number,
          round_name,
          is_completed
        FROM fantasy_rounds
        WHERE league_id = ${leagueId}
          AND round_id = ${roundId}
      `;
      roundInfo = round || null;
    }

    return NextResponse.json({
      success: true,
      league_id: leagueId,
      round_id: roundId,
      round_info: roundInfo,
      players: playersWithPoints,
      total_players: playersWithPoints.length,
      available_players: playersWithPoints.filter((p: any) => p.is_available).length,
      drafted_players: playersWithPoints.filter((p: any) => !p.is_available).length,
    });
  } catch (error) {
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
