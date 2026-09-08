import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/teams/[teamId]/passive-breakdown
 * Get passive points breakdown by round for a fantasy team
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    console.log('🔍 [Passive Breakdown] Request for teamId:', teamId);

    if (!teamId) {
      return NextResponse.json(
        { error: 'Missing team ID' },
        { status: 400 }
      );
    }

    // Get team info from fantasy_teams or fallback to tournament teams
    let team: any = null;
    const teamInfo = await fantasySql`
      SELECT 
        team_id,
        team_name,
        owner_name,
        supported_team_id,
        supported_team_name,
        passive_points,
        league_id
      FROM fantasy_teams
      WHERE team_id = ${teamId}
      LIMIT 1
    `;

    if (teamInfo.length > 0) {
      team = teamInfo[0];
    } else {
      // Look up real tournament team in tournament database
      const { getTournamentDb } = await import('@/lib/neon/tournament-config');
      const tourneySql = getTournamentDb();
      const realTeamRes = await tourneySql`
        SELECT id, team_name FROM teams WHERE id = ${teamId} LIMIT 1
      `;
      if (realTeamRes.length > 0) {
        const rt = realTeamRes[0];
        // Calculate passive points total for this real team from fantasy_team_bonus_points
        const bonusSumRes = await fantasySql`
          SELECT COALESCE(SUM(total_bonus), 0) as total_passive
          FROM fantasy_team_bonus_points
          WHERE real_team_id = ${teamId} OR team_id = ${teamId}
        `;
        team = {
          team_id: rt.id,
          team_name: rt.team_name,
          owner_name: 'Tournament Team',
          supported_team_id: rt.id,
          supported_team_name: rt.team_name,
          passive_points: bonusSumRes[0]?.total_passive || 0,
          league_id: 'SSPSLFLS18'
        };
      }
    }

    if (!team) {
      console.log('❌ [Passive Breakdown] Team not found in fantasy or tournament DB:', teamId);
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    const isFantasyTeam = teamInfo.length > 0;

    // Get passive points breakdown by round:
    // If this is a fantasy team, filter strictly by team_id (its earned passive points).
    // If it's a real tournament team, filter strictly by real_team_id (its performance bonuses).
    const bonusBreakdown = isFantasyTeam
      ? await fantasySql`
          SELECT 
            fixture_id,
            round_number,
            real_team_id,
            real_team_name,
            bonus_breakdown,
            total_bonus,
            calculated_at
          FROM fantasy_team_bonus_points
          WHERE team_id = ${teamId}
          ORDER BY round_number ASC, calculated_at DESC
        `
      : await fantasySql`
          SELECT 
            fixture_id,
            round_number,
            real_team_id,
            real_team_name,
            bonus_breakdown,
            total_bonus,
            calculated_at
          FROM fantasy_team_bonus_points
          WHERE real_team_id = ${teamId} OR real_team_id LIKE ${teamId + '_%'}
          ORDER BY round_number ASC, calculated_at DESC
        `;

    // Fetch fixture details for context (opponent name and score)
    const { getTournamentDb } = await import('@/lib/neon/tournament-config');
    const tourneySql = getTournamentDb();
    const fixtureIds = [...new Set(bonusBreakdown.map((b: any) => b.fixture_id).filter(Boolean))];

    const fixtures = fixtureIds.length > 0
      ? await tourneySql`
          SELECT 
            f.id as fixture_id,
            f.home_team_id,
            f.away_team_id,
            f.home_team_name,
            f.away_team_name,
            COALESCE(SUM(m.home_goals), 0) as home_goals,
            COALESCE(SUM(m.away_goals), 0) as away_goals
          FROM fixtures f
          LEFT JOIN matchups m ON f.id = m.fixture_id
          WHERE f.id = ANY(${fixtureIds})
          GROUP BY f.id, f.home_team_id, f.away_team_id, f.home_team_name, f.away_team_name
        `
      : [];

    const fixtureMap = new Map();
    fixtures.forEach((f: any) => fixtureMap.set(f.fixture_id, f));

    // Get admin bonus points for this team
    console.log('🔍 [Passive Breakdown] Querying admin bonuses for:', {
      target_type: 'team',
      target_id: team.supported_team_id,
      league_id: team.league_id
    });

    const adminBonuses = await fantasySql`
      SELECT 
        id,
        points,
        reason,
        awarded_by,
        awarded_at
      FROM bonus_points
      WHERE target_type = 'team'
        AND target_id = ${team.supported_team_id}
        AND league_id = ${team.league_id}
      ORDER BY awarded_at DESC
    `;

    const totalAdminBonus = adminBonuses.reduce((sum: number, b: any) => sum + (b.points || 0), 0);
    
    console.log('📊 [Passive Breakdown] Admin bonuses found:', {
      count: adminBonuses.length,
      total: totalAdminBonus,
      bonuses: adminBonuses.map((b: any) => ({ reason: b.reason, points: b.points }))
    });

    console.log('📊 [Passive Breakdown] Passive rounds found:', bonusBreakdown.length);
    console.log('📊 [Passive Breakdown] Summary:', {
      passive_points_from_db: team.passive_points,
      passive_rounds_total: bonusBreakdown.reduce((sum: number, b: any) => sum + (b.total_bonus || 0), 0),
      admin_bonus_total: totalAdminBonus,
      should_match: team.passive_points === (bonusBreakdown.reduce((sum: number, b: any) => sum + (b.total_bonus || 0), 0))
    });

    // Calculate statistics
    const stats = {
      total_rounds: bonusBreakdown.length,
      total_passive_points: team.passive_points || 0,
      total_admin_bonus: totalAdminBonus,
      average_per_round: bonusBreakdown.length > 0 
        ? (bonusBreakdown.reduce((sum: number, b: any) => sum + (b.total_bonus || 0), 0) / bonusBreakdown.length).toFixed(1)
        : '0.0',
      best_round: bonusBreakdown.length > 0
        ? Math.max(...bonusBreakdown.map((b: any) => b.total_bonus || 0))
        : 0,
      rounds_with_bonus: bonusBreakdown.filter((b: any) => b.total_bonus > 0).length,
    };

    return NextResponse.json({
      team: {
        team_id: team.team_id,
        team_name: team.team_name,
        owner_name: team.owner_name,
        supported_team_id: team.supported_team_id,
        supported_team_name: team.supported_team_name,
        passive_points: team.passive_points,
        league_id: team.league_id,
      },
      stats,
      admin_bonuses: adminBonuses.map((bonus: any) => ({
        id: bonus.id,
        points: bonus.points,
        reason: bonus.reason,
        awarded_at: bonus.awarded_at,
      })),
      rounds: bonusBreakdown.map((bonus: any) => {
        // Parse bonus_breakdown if it's a string
        let breakdown = bonus.bonus_breakdown;
        if (typeof breakdown === 'string') {
          try {
            breakdown = JSON.parse(breakdown);
          } catch (e) {
            breakdown = {};
          }
        }
        
        const fixture = fixtureMap.get(bonus.fixture_id);
        const realTeamBase = (bonus.real_team_id || '').split('_')[0];
        const homeBase = fixture ? String(fixture.home_team_id || '').split('_')[0] : '';
        const isHome = !!fixture && homeBase === realTeamBase;

        const opponent_name = fixture
          ? (isHome ? fixture.away_team_name : fixture.home_team_name)
          : null;

        const score = fixture && fixture.home_goals !== undefined
          ? (isHome ? `${fixture.home_goals}-${fixture.away_goals}` : `${fixture.away_goals}-${fixture.home_goals}`)
          : null;

        return {
          fixture_id: bonus.fixture_id,
          round_number: bonus.round_number,
          real_team_id: bonus.real_team_id,
          real_team_name: bonus.real_team_name,
          opponent_name,
          score,
          home_away: fixture ? (isHome ? 'H' : 'A') : null,
          bonus_breakdown: breakdown || {},
          total_bonus: bonus.total_bonus,
          calculated_at: bonus.calculated_at,
        };
      }),
    });
  } catch (error: any) {
    console.error('Error fetching passive points breakdown:', error);
    return NextResponse.json(
      { error: 'Failed to fetch passive points breakdown', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
