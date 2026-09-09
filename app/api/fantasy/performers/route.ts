import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * GET /api/fantasy/performers
 * Fetch round & weekly performers:
 * - Team of the Day (TOD): Fantasy team score (player pts + supporting team pts) in a single round
 * - Supporting Team of the Day (STOD): Passive team bonus points in a single round
 * - Player of the Day (POD): Drafted vs Free Agent player points in a single round (respecting window releases)
 * - Team of the Week (TOW): Fantasy team score across 6-round week block
 * - Supporting Team of the Week (STOW): Passive team bonus points across 6-round week block
 * - Player of the Week (POW): Drafted vs Free Agent player points across 6-round week block
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth([], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const requestedRoundStr = searchParams.get('round');
    const requestedWeekStr = searchParams.get('week');

    if (!leagueId) {
      return NextResponse.json({ error: 'Missing league_id' }, { status: 400 });
    }

    // 1. Fetch all distinct rounds in points tables
    const roundsRows = await fantasySql`
      SELECT DISTINCT round_number 
      FROM (
        SELECT round_number FROM fantasy_player_points WHERE league_id = ${leagueId}
        UNION
        SELECT round_number FROM fantasy_team_bonus_points WHERE league_id = ${leagueId}
      ) t
      ORDER BY round_number ASC
    `;

    const availableRounds = roundsRows.map((r: any) => Number(r.round_number)).filter(Boolean);
    const maxRound = availableRounds.length > 0 ? Math.max(...availableRounds) : 1;

    // 2. Generate 6-round week blocks
    const totalWeeksCount = Math.max(1, Math.ceil(maxRound / 6));
    const availableWeeks = [];
    for (let w = 1; w <= totalWeeksCount; w++) {
      const startRound = (w - 1) * 6 + 1;
      const endRound = w * 6;
      availableWeeks.push({
        week: w,
        label: `Week ${w} (Rounds ${startRound}–${endRound})`,
        startRound,
        endRound
      });
    }

    // Default target round & week
    const targetRound = requestedRoundStr ? parseInt(requestedRoundStr, 10) : maxRound;
    const targetWeekNum = requestedWeekStr ? parseInt(requestedWeekStr, 10) : 1;
    const targetWeek = availableWeeks.find(w => w.week === targetWeekNum) || availableWeeks[0];

    // 3. TEAM OF THE DAY (TOD): Fantasy Team score in target round (player pts + supporting team pts)
    const todRows = await fantasySql`
      WITH player_pts AS (
        SELECT 
          team_id,
          COALESCE(SUM(total_points), 0) as player_points,
          COALESCE(SUM(goals_scored), 0) as total_goals,
          COUNT(CASE WHEN is_clean_sheet = true THEN 1 END) as clean_sheets
        FROM fantasy_player_points
        WHERE league_id = ${leagueId} AND round_number = ${targetRound}
        GROUP BY team_id
      ),
      passive_pts AS (
        SELECT 
          team_id,
          real_team_name,
          COALESCE(SUM(total_bonus), 0) as passive_points
        FROM fantasy_team_bonus_points
        WHERE league_id = ${leagueId} AND round_number = ${targetRound}
        GROUP BY team_id, real_team_name
      )
      SELECT 
        ft.team_id,
        ft.team_name,
        ft.owner_name,
        COALESCE(p.player_points, 0) as player_points,
        COALESCE(pas.passive_points, 0) as passive_points,
        (COALESCE(p.player_points, 0) + COALESCE(pas.passive_points, 0)) as total_round_points,
        COALESCE(p.total_goals, 0) as total_goals,
        COALESCE(p.clean_sheets, 0) as clean_sheets,
        pas.real_team_name as supporting_team_name
      FROM fantasy_teams ft
      LEFT JOIN player_pts p ON ft.team_id = p.team_id
      LEFT JOIN passive_pts pas ON ft.team_id = pas.team_id
      WHERE ft.league_id = ${leagueId}
      ORDER BY total_round_points DESC, player_points DESC
    `;

    // 4. SUPPORTING TEAM OF THE DAY (STOD): Passive team bonus points in target round
    const stodRows = await fantasySql`
      SELECT 
        ftbp.team_id as fantasy_team_id,
        ft.team_name as fantasy_team_name,
        ft.owner_name,
        ftbp.real_team_id,
        ftbp.real_team_name,
        ftbp.bonus_breakdown,
        COALESCE(ftbp.total_bonus, 0) as supporting_points
      FROM fantasy_team_bonus_points ftbp
      LEFT JOIN fantasy_teams ft ON ftbp.team_id = ft.team_id
      WHERE ftbp.league_id = ${leagueId} AND ftbp.round_number = ${targetRound}
      ORDER BY supporting_points DESC
    `;

    // 5. PLAYER OF THE DAY (POD): Drafted vs Free Agent players in target round (respecting window draft status in that round)
    const podRows = await fantasySql`
      SELECT 
        fpp.real_player_id,
        fpp.player_name,
        fpp.team_id as fantasy_team_id,
        ft.team_name as fantasy_team_name,
        ft.owner_name as fantasy_owner_name,
        fp.position,
        fp.real_team_name,
        fpp.goals_scored,
        fpp.goals_conceded,
        fpp.result,
        fpp.is_motm,
        fpp.is_clean_sheet,
        fpp.is_captain,
        fpp.is_vice_captain,
        COALESCE(fpp.base_points, 0) as base_points,
        COALESCE(fpp.total_points, 0) as total_points
      FROM fantasy_player_points fpp
      LEFT JOIN fantasy_teams ft ON fpp.team_id = ft.team_id
      LEFT JOIN fantasy_players fp ON (fpp.real_player_id = fp.real_player_id OR fpp.real_player_id = fp.id::text)
      WHERE fpp.league_id = ${leagueId} AND fpp.round_number = ${targetRound}
      ORDER BY fpp.base_points DESC, fpp.total_points DESC
    `;

    const draftedPOD = podRows.filter((p: any) => Boolean(p.fantasy_team_id));
    const freeAgentPOD = podRows.filter((p: any) => !p.fantasy_team_id);

    // 6. TEAM OF THE WEEK (TOW): Fantasy Team score across 6-round week block
    const startR = targetWeek.startRound;
    const endR = targetWeek.endRound;

    const towRows = await fantasySql`
      WITH player_pts AS (
        SELECT 
          team_id,
          COALESCE(SUM(total_points), 0) as player_points,
          COALESCE(SUM(goals_scored), 0) as total_goals,
          COUNT(CASE WHEN is_clean_sheet = true THEN 1 END) as clean_sheets
        FROM fantasy_player_points
        WHERE league_id = ${leagueId} AND round_number BETWEEN ${startR} AND ${endR}
        GROUP BY team_id
      ),
      passive_pts AS (
        SELECT 
          team_id,
          COALESCE(SUM(total_bonus), 0) as passive_points
        FROM fantasy_team_bonus_points
        WHERE league_id = ${leagueId} AND round_number BETWEEN ${startR} AND ${endR}
        GROUP BY team_id
      )
      SELECT 
        ft.team_id,
        ft.team_name,
        ft.owner_name,
        COALESCE(p.player_points, 0) as player_points,
        COALESCE(pas.passive_points, 0) as passive_points,
        (COALESCE(p.player_points, 0) + COALESCE(pas.passive_points, 0)) as total_week_points,
        COALESCE(p.total_goals, 0) as total_goals,
        COALESCE(p.clean_sheets, 0) as clean_sheets
      FROM fantasy_teams ft
      LEFT JOIN player_pts p ON ft.team_id = p.team_id
      LEFT JOIN passive_pts pas ON ft.team_id = pas.team_id
      WHERE ft.league_id = ${leagueId}
      ORDER BY total_week_points DESC, player_points DESC
    `;

    // 7. SUPPORTING TEAM OF THE WEEK (STOW): Passive team bonus points across 6-round block
    const stowRows = await fantasySql`
      SELECT 
        ftbp.team_id as fantasy_team_id,
        ft.team_name as fantasy_team_name,
        ft.owner_name,
        ftbp.real_team_name,
        COALESCE(SUM(ftbp.total_bonus), 0) as supporting_points
      FROM fantasy_team_bonus_points ftbp
      LEFT JOIN fantasy_teams ft ON ftbp.team_id = ft.team_id
      WHERE ftbp.league_id = ${leagueId} AND ftbp.round_number BETWEEN ${startR} AND ${endR}
      GROUP BY ftbp.team_id, ft.team_name, ft.owner_name, ftbp.real_team_name
      ORDER BY supporting_points DESC
    `;

    // 8. PLAYER OF THE WEEK (POW): Drafted vs Free Agent players across 6-round block
    const powRows = await fantasySql`
      SELECT 
        fpp.real_player_id,
        fpp.player_name,
        fpp.team_id as fantasy_team_id,
        ft.team_name as fantasy_team_name,
        ft.owner_name as fantasy_owner_name,
        fp.position,
        fp.real_team_name,
        COALESCE(SUM(fpp.goals_scored), 0) as total_goals,
        COALESCE(SUM(fpp.base_points), 0) as player_base_points,
        COALESCE(SUM(fpp.total_points), 0) as player_total_points
      FROM fantasy_player_points fpp
      LEFT JOIN fantasy_teams ft ON fpp.team_id = ft.team_id
      LEFT JOIN fantasy_players fp ON (fpp.real_player_id = fp.real_player_id OR fpp.real_player_id = fp.id::text)
      WHERE fpp.league_id = ${leagueId} AND fpp.round_number BETWEEN ${startR} AND ${endR}
      GROUP BY fpp.real_player_id, fpp.player_name, fpp.team_id, ft.team_name, ft.owner_name, fp.position, fp.real_team_name
      ORDER BY player_base_points DESC, player_total_points DESC
    `;

    const draftedPOW = powRows.filter((p: any) => Boolean(p.fantasy_team_id));
    const freeAgentPOW = powRows.filter((p: any) => !p.fantasy_team_id);

    return NextResponse.json({
      available_rounds: availableRounds,
      available_weeks: availableWeeks,
      target_round: targetRound,
      target_week: targetWeek,

      round_performers: {
        team_of_the_day: todRows,
        supporting_team_of_the_day: stodRows,
        player_of_the_day_drafted: draftedPOD,
        player_of_the_day_free_agent: freeAgentPOD,
      },

      week_performers: {
        team_of_the_week: towRows,
        supporting_team_of_the_week: stowRows,
        player_of_the_week_drafted: draftedPOW,
        player_of_the_week_free_agent: freeAgentPOW,
      }
    });

  } catch (error: any) {
    console.error('Error fetching fantasy performers data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch performers data' },
      { status: 500 }
    );
  }
}
