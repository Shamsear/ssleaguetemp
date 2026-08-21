import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET /api/fantasy/players/[playerId]/breakdown?league_id=xxx
 * Get detailed match-by-match breakdown for a player (base points, no multipliers)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const league_id = searchParams.get('league_id');

    if (!playerId) {
      return NextResponse.json(
        { error: 'Player ID is required' },
        { status: 400 }
      );
    }

    if (!league_id) {
      return NextResponse.json(
        { error: 'league_id query parameter is required' },
        { status: 400 }
      );
    }

    // Get fantasy league to get season_id
    const leagues = await fantasySql`
      SELECT * FROM fantasy_leagues
      WHERE league_id = ${league_id}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy league not found' },
        { status: 404 }
      );
    }

    const leagueData = leagues[0];
    const tournamentSql = getTournamentDb();

    const seasonNum = parseInt(leagueData.season_id.replace(/\D/g, '')) || 0;
    const isModern = seasonNum >= 16;

    // Get player info from correct table (used for opponent lookup — non-fatal if not found)
    let players;
    try {
      if (isModern) {
        players = await tournamentSql`
          SELECT * FROM player_seasons
          WHERE player_id = ${playerId}
            AND season_id = ${leagueData.season_id}
          LIMIT 1
        `;
      } else {
        players = await tournamentSql`
          SELECT * FROM realplayerstats
          WHERE player_id = ${playerId}
            AND season_id = ${leagueData.season_id}
          LIMIT 1
        `;
      }
    } catch {
      players = [];
    }

    const playerData = players?.[0] || null;
    const playerTeamId = playerData?.team_id || null;

    // Get all fantasy points for this player (deduplicated by fixture)
    // Use base_points instead of total_points to exclude multipliers
    const playerPoints = await fantasySql`
      SELECT 
        fixture_id,
        round_number,
        goals_scored,
        goals_conceded,
        result,
        is_motm,
        fine_goals,
        substitution_penalty,
        is_clean_sheet,
        base_points,
        points_breakdown,
        MIN(calculated_at) as calculated_at
      FROM fantasy_player_points
      WHERE league_id = ${league_id}
        AND real_player_id = ${playerId}
      GROUP BY 
        fixture_id, round_number, goals_scored, goals_conceded, 
        result, is_motm, fine_goals, substitution_penalty,
        is_clean_sheet, base_points, points_breakdown
      ORDER BY round_number ASC
    `;

    // Fetch fixture details to get opponent information
    const fixtureIds = playerPoints.map((p: any) => p.fixture_id).filter(Boolean);
    const fixturesMap = new Map();
    
    if (fixtureIds.length > 0) {
      try {
        const fixtures = await tournamentSql`
          SELECT * FROM fixtures
          WHERE fixture_id = ANY(${fixtureIds})
        `;
        fixtures.forEach((fixture: any) => {
          fixturesMap.set(fixture.fixture_id, fixture);
        });
      } catch (fixtureError) {
        console.error('Error fetching fixtures:', fixtureError);
      }
    }

    const matchHistory = playerPoints.map((data: any) => {
      const fixture = fixturesMap.get(data.fixture_id);
      
      let opponent = '—';
      if (fixture && playerTeamId) {
        if (fixture.home_team_id === playerTeamId) {
          opponent = fixture.away_team_name || 'Away Team';
        } else if (fixture.away_team_id === playerTeamId) {
          opponent = fixture.home_team_name || 'Home Team';
        }
      }

      let pointsBreakdown = data.points_breakdown;
      if (typeof pointsBreakdown === 'string') {
        try { pointsBreakdown = JSON.parse(pointsBreakdown); } catch { pointsBreakdown = {}; }
      }
      
      return {
        fixture_id: data.fixture_id,
        round_number: data.round_number,
        opponent,
        goals_scored: data.goals_scored || 0,
        goals_conceded: data.goals_conceded || 0,
        result: data.result,
        is_motm: data.is_motm || false,
        is_clean_sheet: data.is_clean_sheet || false,
        fine_goals: data.fine_goals || 0,
        substitution_penalty: data.substitution_penalty || 0,
        points_breakdown: pointsBreakdown || {},
        base_points: data.base_points || 0,
      };
    });

    // Get admin bonus points for this player
    let adminBonuses: any[] = [];
    try {
      adminBonuses = await fantasySql`
        SELECT id, points, reason, awarded_by, awarded_at
        FROM bonus_points
        WHERE target_type = 'player'
          AND target_id = ${playerId}
          AND league_id = ${league_id}
        ORDER BY awarded_at DESC
      `;
    } catch { /* bonus_points table may not exist */ }

    const totalAdminBonus = adminBonuses.reduce((sum: number, b: any) => sum + (b.points || 0), 0);
    const totalBasePoints = matchHistory.reduce((sum: number, m: any) => sum + (m.base_points || 0), 0);

    return NextResponse.json({
      success: true,
      stats: {
        total_matches: matchHistory.length,
        total_base_points: totalBasePoints,
        total_admin_bonus: totalAdminBonus,
        total_points_with_bonus: totalBasePoints + totalAdminBonus,
      },
      admin_bonuses: adminBonuses.map((bonus: any) => ({
        id: bonus.id,
        points: bonus.points,
        reason: bonus.reason,
        awarded_at: bonus.awarded_at,
      })),
      matches: matchHistory,
    });
  } catch (error) {
    console.error('Error fetching player breakdown:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player breakdown', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
