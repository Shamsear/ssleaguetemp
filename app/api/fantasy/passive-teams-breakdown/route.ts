import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET /api/fantasy/passive-teams-breakdown
 * Return passive team points breakdown by round for ALL real tournament teams in the active season
 */
export async function GET(request: NextRequest) {
  try {
    const tournamentSql = getTournamentDb();

    // Fetch active season & fantasy league
    const leagues = await fantasySql`
      SELECT league_id, season_id
      FROM fantasy_leagues
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const leagueId = leagues[0]?.league_id || 'SSPSLFLS18';
    const seasonId = leagues[0]?.season_id || 'SSPSLS18';

    // Fetch all real tournament teams
    const realTeams = await tournamentSql`
      SELECT id, team_name, logo_url
      FROM teams
      WHERE season_id = ${seasonId} OR id LIKE 'SSPSLT%'
      ORDER BY team_name ASC
    `;

    // Fetch all passive team bonus records from fantasy_team_bonus_points
    const bonusRecords = await fantasySql`
      SELECT 
        team_id,
        real_team_id,
        real_team_name,
        fixture_id,
        round_number,
        bonus_breakdown,
        total_bonus,
        calculated_at
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId} OR league_id = 'SSPSLFLS18'
      ORDER BY round_number ASC
    `;

    // Fetch admin team bonuses
    const adminBonuses = await fantasySql`
      SELECT 
        id,
        target_id,
        points,
        reason,
        awarded_at
      FROM bonus_points
      WHERE target_type = 'team'
      ORDER BY awarded_at DESC
    `;

    // Fetch completed fixtures for context
    const completedFixtures = await tournamentSql`
      SELECT 
        f.id as fixture_id,
        f.home_team_id,
        f.away_team_id,
        f.home_team_name,
        f.away_team_name,
        f.round_number,
        f.home_score,
        f.away_score
      FROM fixtures f
      WHERE f.season_id = ${seasonId}
        AND f.status = 'completed'
      ORDER BY f.round_number ASC
    `;

    const fixtureMap = new Map();
    completedFixtures.forEach((f: any) => fixtureMap.set(f.fixture_id, f));

    // Map breakdown per real team
    const teamBreakdowns = realTeams.map((realTeam: any) => {
      const teamId = realTeam.id;

      // Filter bonus records for this real team
      const teamBonuses = bonusRecords.filter((b: any) => 
        b.real_team_id === teamId || b.team_id === teamId || b.team_id.startsWith(`${teamId}_`)
      );

      // Filter admin bonuses for this real team
      const teamAdminBonuses = adminBonuses.filter((b: any) => 
        b.target_id === teamId || b.target_id.startsWith(`${teamId}_`)
      );

      const totalBonusFromMatches = teamBonuses.reduce((sum: number, b: any) => sum + (b.total_bonus || 0), 0);
      const totalAdminBonus = teamAdminBonuses.reduce((sum: number, b: any) => sum + (b.points || 0), 0);
      const totalPassivePoints = totalBonusFromMatches + totalAdminBonus;

      // Format round matches
      const rounds = teamBonuses.map((b: any) => {
        const fixture = fixtureMap.get(b.fixture_id);
        let breakdown = b.bonus_breakdown;
        if (typeof breakdown === 'string') {
          try { breakdown = JSON.parse(breakdown); } catch (e) { breakdown = {}; }
        }

        return {
          fixture_id: b.fixture_id,
          round_number: b.round_number,
          opponent_name: fixture ? (fixture.home_team_id === teamId ? fixture.away_team_name : fixture.home_team_name) : 'Opponent',
          score: fixture ? `${fixture.home_score} - ${fixture.away_score}` : 'N/A',
          bonus_breakdown: breakdown || {},
          total_bonus: b.total_bonus || 0,
          calculated_at: b.calculated_at,
        };
      });

      return {
        real_team_id: teamId,
        team_name: realTeam.team_name,
        logo_url: realTeam.logo_url,
        total_passive_points: totalPassivePoints,
        total_match_bonus: totalBonusFromMatches,
        total_admin_bonus: totalAdminBonus,
        rounds,
        admin_bonuses: teamAdminBonuses.map((ab: any) => ({
          id: ab.id,
          points: ab.points,
          reason: ab.reason,
          awarded_at: ab.awarded_at,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      season_id: seasonId,
      league_id: leagueId,
      teams: teamBreakdowns,
    });
  } catch (error: any) {
    console.error('Error fetching passive teams breakdown:', error);
    return NextResponse.json(
      { error: 'Failed to fetch passive teams breakdown', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
