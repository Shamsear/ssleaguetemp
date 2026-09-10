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

    // 3. RESOLVE SUPPORTED TEAMS PER TEAM & WINDOW
    const slot6Bids = await fantasySql`
      SELECT fdb.team_id, fdb.target_id, ft.team_name as target_team_name
      FROM fantasy_draft_bids fdb
      LEFT JOIN fantasy_teams ft ON (
        fdb.target_id = ft.team_id 
        OR fdb.target_id LIKE (ft.team_id || '_%')
        OR ft.team_id = SPLIT_PART(fdb.target_id, '_', 1)
      )
      WHERE fdb.league_id = ${leagueId} AND fdb.slot_index = 6 AND fdb.status = 'won'
    `;
    const initialSupportedTeamMap: Record<string, string> = {};
    slot6Bids.forEach((b: any) => {
      let name = b.target_team_name;
      const raw = (b.target_id || '').toUpperCase();
      if (!name || name === b.target_id || name.startsWith('SSPSLT')) {
        if (raw.includes('SSPSLT0018')) name = 'TITANS FC';
        else if (raw.includes('SSPSLT0015')) name = 'LEGENDS FC';
        else if (raw.includes('SSPSLT0021')) name = 'LOS GALACTICOS';
        else if (raw.includes('SSPSLT0005')) name = 'TM ASGARDIANS';
        else if (raw.includes('SSPSLT0006')) name = 'PES GUARDIANS';
        else if (raw.includes('SSPSLT0001')) name = 'CLASSIC TENS';
        else if (raw.includes('SSPSLT0041')) name = 'ANDIMUKK FC';
        else if (raw.includes('SSPSLT0027')) name = 'PES GUARDIANS';
        else if (raw.includes('SSPSLT0003')) name = 'RED PANTHERS';
        else if (raw.includes('SSPSLT0004')) name = 'RED HAWKS FC';
        else name = b.target_id;
      }
      initialSupportedTeamMap[b.team_id] = name;
    });

    const passiveReleases = await fantasySql`
      SELECT fr.team_id, fr.real_player_id, fr.player_name, fr.is_passive_team
      FROM fantasy_releases fr
      WHERE fr.league_id = ${leagueId} AND fr.is_passive_team = true
    `;

    const postReleasePassiveWon = await fantasySql`
      SELECT fprb.team_id, fprb.target_id, fprb.target_name, fprb.category, fprb.is_passive_team
      FROM fantasy_post_release_bids fprb
      WHERE fprb.league_id = ${leagueId} AND fprb.status = 'won' AND (fprb.is_passive_team = true OR fprb.category ILIKE '%passive%')
    `;

    // 4. TEAM OF THE DAY (TOD): Fantasy Team score in target round (player pts + supporting team pts)
    const playerPtsRows = await fantasySql`
      SELECT 
        team_id,
        COALESCE(SUM(total_points), 0) as player_points,
        COALESCE(SUM(goals_scored), 0) as total_goals,
        COUNT(CASE WHEN is_clean_sheet = true THEN 1 END) as clean_sheets
      FROM fantasy_player_points
      WHERE league_id = ${leagueId} AND round_number = ${targetRound}
      GROUP BY team_id
    `;
    const playerPtsMap: Record<string, any> = {};
    playerPtsRows.forEach((r: any) => {
      playerPtsMap[r.team_id] = r;
    });

    const bonusPtsRows = await fantasySql`
      SELECT 
        team_id,
        real_team_name,
        COALESCE(SUM(total_bonus), 0) as passive_points
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId} AND round_number = ${targetRound}
      GROUP BY team_id, real_team_name
    `;
    const bonusPtsMap: Record<string, any> = {};
    bonusPtsRows.forEach((r: any) => {
      bonusPtsMap[r.team_id] = r;
    });

    const allTeams = await fantasySql`
      SELECT team_id, team_name, owner_name
      FROM fantasy_teams
      WHERE league_id = ${leagueId}
    `;

    const todRows = allTeams.map((ft: any) => {
      const pData = playerPtsMap[ft.team_id];
      const bData = bonusPtsMap[ft.team_id];

      const player_points = pData ? Number(pData.player_points) : 0;
      const passive_points = bData ? Number(bData.passive_points) : 0;
      const total_round_points = player_points + passive_points;

      let supporting_team_name = bData?.real_team_name;
      if (!supporting_team_name) {
        if (targetRound >= 7) {
          const wonNew = postReleasePassiveWon.find((b: any) => b.team_id === ft.team_id);
          const wasRel = passiveReleases.find((r: any) => r.team_id === ft.team_id);
          if (wonNew) supporting_team_name = wonNew.target_name || wonNew.target_id;
          else if (wasRel) supporting_team_name = 'None (Released)';
          else supporting_team_name = initialSupportedTeamMap[ft.team_id] || 'N/A';
        } else {
          supporting_team_name = initialSupportedTeamMap[ft.team_id] || 'N/A';
        }
      }

      return {
        team_id: ft.team_id,
        team_name: ft.team_name,
        owner_name: ft.owner_name,
        player_points,
        passive_points,
        total_round_points,
        total_goals: pData ? Number(pData.total_goals) : 0,
        clean_sheets: pData ? Number(pData.clean_sheets) : 0,
        supporting_team_name
      };
    });

    todRows.sort((a, b) => {
      const diff = b.total_round_points - a.total_round_points;
      if (diff !== 0) return diff;
      return b.player_points - a.player_points;
    });

    // 5. SUPPORTING TEAM OF THE DAY (STOD): Passive team bonus points in target round
    const stodRawRows = await fantasySql`
      SELECT 
        ftbp.team_id as fantasy_team_id,
        ft.team_name as fantasy_team_name,
        ft.owner_name,
        ftbp.real_team_id,
        ftbp.real_team_name,
        ftbp.bonus_breakdown,
        COALESCE(ftbp.total_bonus, 0) as supporting_points
      FROM fantasy_team_bonus_points ftbp
      JOIN fantasy_teams ft ON ftbp.team_id = ft.team_id
      WHERE ftbp.league_id = ${leagueId} AND ftbp.round_number = ${targetRound}
      ORDER BY supporting_points DESC
    `;

    // Deduplicate STOD rows per fantasy team
    const stodSeenMap = new Map();
    stodRawRows.forEach((r: any) => {
      if (!stodSeenMap.has(r.fantasy_team_id)) {
        stodSeenMap.set(r.fantasy_team_id, r);
      }
    });
    const stodRows = Array.from(stodSeenMap.values());
    stodRows.sort((a, b) => Number(b.supporting_points) - Number(a.supporting_points));

    // 6. PLAYER OF THE DAY (POD): Drafted vs Free Agent players in target round (respecting window draft status in that round)
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

    // 7. TEAM OF THE WEEK (TOW): Fantasy Team score across 6-round week block
    const startR = targetWeek.startRound;
    const endR = targetWeek.endRound;

    const playerWeekPtsRows = await fantasySql`
      SELECT 
        team_id,
        COALESCE(SUM(total_points), 0) as player_points,
        COALESCE(SUM(goals_scored), 0) as total_goals,
        COUNT(CASE WHEN is_clean_sheet = true THEN 1 END) as clean_sheets
      FROM fantasy_player_points
      WHERE league_id = ${leagueId} AND round_number BETWEEN ${startR} AND ${endR}
      GROUP BY team_id
    `;
    const playerWeekPtsMap: Record<string, any> = {};
    playerWeekPtsRows.forEach((r: any) => {
      playerWeekPtsMap[r.team_id] = r;
    });

    const bonusWeekPtsRows = await fantasySql`
      SELECT 
        team_id,
        COALESCE(SUM(total_bonus), 0) as passive_points
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId} AND round_number BETWEEN ${startR} AND ${endR}
      GROUP BY team_id
    `;
    const bonusWeekPtsMap: Record<string, any> = {};
    bonusWeekPtsRows.forEach((r: any) => {
      bonusWeekPtsMap[r.team_id] = r;
    });

    const towRows = allTeams.map((ft: any) => {
      const pData = playerWeekPtsMap[ft.team_id];
      const bData = bonusWeekPtsMap[ft.team_id];

      const player_points = pData ? Number(pData.player_points) : 0;
      const passive_points = bData ? Number(bData.passive_points) : 0;
      const total_week_points = player_points + passive_points;

      return {
        team_id: ft.team_id,
        team_name: ft.team_name,
        owner_name: ft.owner_name,
        player_points,
        passive_points,
        total_week_points,
        total_goals: pData ? Number(pData.total_goals) : 0,
        clean_sheets: pData ? Number(pData.clean_sheets) : 0
      };
    });

    towRows.sort((a, b) => {
      const diff = b.total_week_points - a.total_week_points;
      if (diff !== 0) return diff;
      return b.player_points - a.player_points;
    });

    // 8. SUPPORTING TEAM OF THE WEEK (STOW): Passive team bonus points across 6-round block
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

    // 9. PLAYER OF THE WEEK (POW): Drafted vs Free Agent players across 6-round block
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
