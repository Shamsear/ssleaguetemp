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
      WHERE league_id = ${league_id} OR league_id = 'SSPSLFLS18'
      LIMIT 1
    `;

    const tournamentSql = getTournamentDb();

    // Get all completed matchups for this player in SSPSLS18
    const matchups = await tournamentSql`
      SELECT 
        m.fixture_id,
        m.home_player_id,
        m.home_player_name,
        m.away_player_id,
        m.away_player_name,
        m.home_goals,
        m.away_goals,
        m.home_category,
        m.away_category,
        f.motm_player_id,
        f.round_number,
        f.home_team_name,
        f.away_team_name
      FROM matchups m
      JOIN fixtures f ON m.fixture_id = f.id
      WHERE (m.home_player_id = ${playerId} OR m.away_player_id = ${playerId})
        AND (f.season_id = 'SSPSLS18' OR f.season_id LIKE 'SSPSLS18%')
        AND f.status = 'completed'
        AND m.home_goals IS NOT NULL
        AND m.away_goals IS NOT NULL
      ORDER BY f.round_number ASC
    `;

    // Fetch fantasy_player_points for stored breakdowns / base points
    const playerPoints = await fantasySql`
      SELECT 
        round_number,
        goals_scored,
        goals_conceded,
        result,
        is_motm,
        is_clean_sheet,
        base_points,
        points_breakdown
      FROM fantasy_player_points
      WHERE (league_id = ${league_id} OR league_id = 'SSPSLFLS18')
        AND real_player_id = ${playerId}
    `;

    const fppMap = new Map();
    playerPoints.forEach((p: any) => {
      fppMap.set(p.round_number, p);
    });

    const getPointsForOpponentCategory = (oppCat: string, outcome: string) => {
      const cat = (oppCat || '').toLowerCase();
      if (cat.includes('red') || cat === 'r') return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3);
      if (cat.includes('black')) return outcome === 'win' ? 7 : (outcome === 'draw' ? 3 : -4);
      if (cat.includes('blue') || cat === 'b') return outcome === 'win' ? 6 : (outcome === 'draw' ? 2 : -5);
      if (cat.includes('white') || cat === 'w') return outcome === 'win' ? 5 : (outcome === 'draw' ? 1 : -6);
      return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3);
    };

    const matchHistory = matchups.map((m: any) => {
      const isHome = m.home_player_id === playerId;
      const goalsScored = Number(isHome ? m.home_goals : m.away_goals) || 0;
      const goalsConceded = Number(isHome ? m.away_goals : m.home_goals) || 0;
      const oppName = isHome ? (m.away_player_name || m.away_team_name) : (m.home_player_name || m.home_team_name);
      const oppCat = (isHome ? m.away_category : m.home_category) || 'Red';
      
      const gd = goalsScored - goalsConceded;
      const res = gd > 0 ? 'win' : (gd === 0 ? 'draw' : 'loss');
      const isCleanSheet = goalsConceded === 0;
      const isMotm = m.motm_player_id === playerId;

      const fppData = fppMap.get(m.round_number);
      const calculatedPts = getPointsForOpponentCategory(oppCat, res);
      const basePts = fppData?.base_points !== undefined ? Number(fppData.base_points) : calculatedPts;

      let pointsBreakdown = fppData?.points_breakdown || {};
      if (typeof pointsBreakdown === 'string') {
        try { pointsBreakdown = JSON.parse(pointsBreakdown); } catch { pointsBreakdown = {}; }
      }

      // If points_breakdown is empty, dynamically construct full itemized breakdown
      if (!pointsBreakdown || Object.keys(pointsBreakdown).length === 0) {
        pointsBreakdown = {};
        const catKey = (oppCat || 'RED').toLowerCase();
        pointsBreakdown[`${res}_vs_${catKey}`] = calculatedPts;

        if (goalsScored > 0) {
          pointsBreakdown[`goals_scored_(${goalsScored})`] = goalsScored * 5;
          if (goalsScored >= 3) pointsBreakdown['hat_trick_bonus'] = 5;
        }
        if (isCleanSheet) {
          pointsBreakdown['clean_sheet_bonus'] = 4;
        }
        if (isMotm) {
          pointsBreakdown['motm_award'] = 5;
        }
        if (goalsConceded >= 4) {
          pointsBreakdown['concedes_4_plus_goals'] = -3;
        }
      }

      return {
        fixture_id: m.fixture_id,
        round_number: m.round_number,
        opponent: oppName,
        opponent_category: oppCat.toUpperCase(),
        goals_scored: goalsScored,
        goals_conceded: goalsConceded,
        result: res,
        is_motm: isMotm,
        is_clean_sheet: isCleanSheet,
        fine_goals: 0,
        substitution_penalty: 0,
        points_breakdown: pointsBreakdown,
        base_points: basePts,
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
