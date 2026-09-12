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

    // 2. Resolve week blocks (from fantasy_captain_windows if configured, else 6-round default)
    const capWindows = await fantasySql`
      SELECT window_id, round_name, start_round, end_round 
      FROM fantasy_captain_windows 
      WHERE league_id = ${leagueId} AND start_round IS NOT NULL AND end_round IS NOT NULL
      ORDER BY start_round ASC
    `;

    let availableWeeks: Array<{
      week: number;
      label: string;
      startRound: number;
      endRound: number;
    }> = [];

    if (capWindows.length > 0) {
      availableWeeks = capWindows.map((cw: any, idx: number) => ({
        week: idx + 1,
        label: cw.round_name 
          ? `${cw.round_name} (Rounds ${cw.start_round}–${cw.end_round})` 
          : `Week ${idx + 1} (Rounds ${cw.start_round}–${cw.end_round})`,
        startRound: Number(cw.start_round),
        endRound: Number(cw.end_round)
      }));

      // If max round in points table extends past configured windows, append further blocks
      let lastEnd = availableWeeks[availableWeeks.length - 1].endRound;
      let nextW = availableWeeks.length + 1;
      while (maxRound > lastEnd) {
        const s = lastEnd + 1;
        const e = s + 5;
        availableWeeks.push({
          week: nextW,
          label: `Week ${nextW} (Rounds ${s}–${e})`,
          startRound: s,
          endRound: e
        });
        lastEnd = e;
        nextW++;
      }
    } else {
      const totalWeeksCount = Math.max(1, Math.ceil(maxRound / 6));
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
        total_bonus,
        bonus_breakdown
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId} AND round_number = ${targetRound}
    `;
    const bonusPtsMap = new Map<string, any>();
    bonusPtsRows.forEach((r: any) => {
      let bd: any = {};
      try {
        bd = typeof r.bonus_breakdown === 'string' ? JSON.parse(r.bonus_breakdown) : (r.bonus_breakdown || {});
      } catch (e) {
        bd = {};
      }
      const existing = bonusPtsMap.get(r.team_id);
      if (!existing) {
        bonusPtsMap.set(r.team_id, {
          team_id: r.team_id,
          real_team_name: r.real_team_name,
          passive_points: Number(r.total_bonus || 0),
          bonus_breakdown: bd
        });
      } else {
        existing.passive_points += Number(r.total_bonus || 0);
        if (bd && typeof bd === 'object') {
          Object.entries(bd).forEach(([k, v]) => {
            if (k === 'team_of_the_day' || k === 'team_of_the_week') {
              existing.bonus_breakdown[k] = Math.max(Number(existing.bonus_breakdown[k] || 0), Number(v || 0));
            } else {
              existing.bonus_breakdown[k] = (existing.bonus_breakdown[k] || 0) + Number(v || 0);
            }
          });
        }
      }
    });

    const allTeams = await fantasySql`
      SELECT team_id, team_name, owner_name, supported_team_id, supported_team_name
      FROM fantasy_teams
      WHERE league_id = ${leagueId}
      ORDER BY team_name
    `;

    // 4b. Window and squad reconstruction for targetRound
    const firstWinRows = await fantasySql`
      SELECT MIN(start_round) as first_start
      FROM fantasy_transfer_windows
      WHERE league_id = ${leagueId} AND start_round IS NOT NULL
    `;
    const firstWindowStartRound = Number(firstWinRows[0]?.first_start || 7);

    // Fetch Captain History for targetRound
    const capWinRows = await fantasySql`
      SELECT window_id FROM fantasy_captain_windows
      WHERE league_id = ${leagueId} AND ${targetRound} >= start_round AND ${targetRound} <= end_round
      LIMIT 1
    `;
    const capHistMap = new Map<string, any>();
    if (capWinRows.length > 0 && capWinRows[0].window_id) {
      const capHist = await fantasySql`
        SELECT team_id, captain_player_id, vice_captain_player_id
        FROM fantasy_captain_history
        WHERE league_id = ${leagueId} AND window_id = ${capWinRows[0].window_id}
      `;
      capHist.forEach((c: any) => capHistMap.set(c.team_id, c));
    }

    const currentSquad = await fantasySql`
      SELECT 
        fs.team_id, 
        fs.real_player_id, 
        fs.player_name, 
        COALESCE(fp.category, fs.position) as category, 
        fs.position, 
        fs.real_team_name, 
        fs.is_captain, 
        fs.is_vice_captain, 
        fs.acquisition_type
      FROM fantasy_squad fs
      LEFT JOIN fantasy_players fp ON ((fs.real_player_id = fp.real_player_id OR fs.real_player_id = fp.id::text) AND fp.league_id = ${leagueId})
      WHERE fs.league_id = ${leagueId}
    `;

    const releases = await fantasySql`
      SELECT team_id, real_player_id, player_name, category, window_id
      FROM fantasy_releases
      WHERE league_id = ${leagueId} AND is_passive_team = false
    `;

    const teamSquadMap = new Map<string, any[]>();
    allTeams.forEach((ft: any) => {
      let squadList: any[] = [];
      if (targetRound < firstWindowStartRound) {
        const retained = currentSquad.filter((s: any) => s.team_id === ft.team_id && s.acquisition_type !== 'post_release_draft');
        const rel = releases.filter((r: any) => r.team_id === ft.team_id);
        squadList = [...retained, ...rel];
      } else {
        squadList = currentSquad.filter((s: any) => s.team_id === ft.team_id);
      }

      const cap = capHistMap.get(ft.team_id);
      squadList = squadList.map((p: any) => {
        const isCaptain = cap ? cap.captain_player_id === p.real_player_id : !!p.is_captain;
        const isViceCaptain = cap ? cap.vice_captain_player_id === p.real_player_id : !!p.is_vice_captain;
        return {
          ...p,
          is_captain: isCaptain,
          is_vice_captain: isViceCaptain
        };
      });

      teamSquadMap.set(ft.team_id, squadList);
    });

    // Fetch detailed player points for each team in targetRound for itemized round breakdown
    const roundPlayerDetails = await fantasySql`
      SELECT 
        fpp.team_id,
        fpp.real_player_id,
        fpp.player_name,
        fp.category,
        fp.position,
        fp.real_team_name,
        fpp.goals_scored,
        fpp.goals_conceded,
        fpp.result,
        fpp.is_motm,
        fpp.is_clean_sheet,
        fpp.is_captain,
        fpp.is_vice_captain,
        fpp.base_points,
        fpp.points_multiplier,
        fpp.points_breakdown,
        fpp.total_points,
        opp_fp.player_name as opponent_name,
        opp_fp.category as opponent_category
      FROM fantasy_player_points fpp
      LEFT JOIN fantasy_players fp ON ((fpp.real_player_id = fp.real_player_id OR fpp.real_player_id = fp.id::text) AND fp.league_id = ${leagueId})
      LEFT JOIN fantasy_players opp_fp ON ((fpp.points_breakdown->>'opponent_player_id' = opp_fp.real_player_id OR fpp.points_breakdown->>'opponent_player_id' = opp_fp.id::text) AND opp_fp.league_id = ${leagueId})
      WHERE fpp.league_id = ${leagueId} AND fpp.round_number = ${targetRound}
      ORDER BY fpp.total_points DESC
    `;

    // Aggregate roundPlayerDetails per player per team in targetRound (handles multiple fixtures in a single round)
    const aggregatedPlayerDetailsMap = new Map<string, any>();
    roundPlayerDetails.forEach((p: any) => {
      const key = `${p.team_id}_${p.real_player_id}`;
      const existing = aggregatedPlayerDetailsMap.get(key);
      let bd: any = {};
      try {
        bd = typeof p.points_breakdown === 'string' ? JSON.parse(p.points_breakdown || '{}') : (p.points_breakdown || {});
      } catch (e) {
        bd = {};
      }

      if (!existing) {
        aggregatedPlayerDetailsMap.set(key, {
          ...p,
          category: p.category,
          opponent_name: p.opponent_name || null,
          opponent_category: p.opponent_category || null,
          goals_scored: Number(p.goals_scored || 0),
          goals_conceded: Number(p.goals_conceded || 0),
          base_points: Number(p.base_points || 0),
          total_points: Number(p.total_points || 0),
          points_breakdown: bd,
          is_motm: !!p.is_motm,
          is_clean_sheet: !!p.is_clean_sheet,
          is_captain: !!p.is_captain,
          is_vice_captain: !!p.is_vice_captain,
        });
      } else {
        existing.goals_scored += Number(p.goals_scored || 0);
        existing.goals_conceded += Number(p.goals_conceded || 0);
        existing.base_points += Number(p.base_points || 0);
        existing.total_points += Number(p.total_points || 0);
        if (!existing.opponent_name && p.opponent_name) {
          existing.opponent_name = p.opponent_name;
          existing.opponent_category = p.opponent_category;
        }
        if (p.is_motm) existing.is_motm = true;
        if (p.is_clean_sheet) existing.is_clean_sheet = true;
        if (p.is_captain) existing.is_captain = true;
        if (p.is_vice_captain) existing.is_vice_captain = true;
        if (bd && typeof bd === 'object') {
          Object.entries(bd).forEach(([k, v]) => {
            if (typeof v === 'number') {
              existing.points_breakdown[k] = (existing.points_breakdown[k] || 0) + v;
            } else if (!existing.points_breakdown[k]) {
              existing.points_breakdown[k] = v;
            }
          });
        }
      }
    });
    const aggregatedRoundPlayerDetails = Array.from(aggregatedPlayerDetailsMap.values());

    const todRows = allTeams.map((ft: any) => {
      const pData = playerPtsMap[ft.team_id];
      const bData = bonusPtsMap.get(ft.team_id);

      const squadList = teamSquadMap.get(ft.team_id) || [];
      const matchedIds = new Set<string>();

      const players = squadList.map((sq: any) => {
        matchedIds.add(sq.real_player_id);
        const fpp = aggregatedRoundPlayerDetails.find(
          (p: any) => p.real_player_id === sq.real_player_id && (p.team_id === ft.team_id || p.team_id === 'unassigned')
        );
        if (fpp) {
          return {
            ...fpp,
            player_name: fpp.player_name || sq.player_name,
            category: fpp.category || sq.category,
            is_captain: sq.is_captain || fpp.is_captain,
            is_vice_captain: sq.is_vice_captain || fpp.is_vice_captain,
            did_not_play: false
          };
        } else {
          return {
            team_id: ft.team_id,
            real_player_id: sq.real_player_id,
            player_name: sq.player_name,
            category: sq.category || null,
            position: sq.position,
            goals_scored: 0,
            goals_conceded: 0,
            result: 'dnp',
            is_motm: false,
            is_clean_sheet: false,
            is_captain: sq.is_captain,
            is_vice_captain: sq.is_vice_captain,
            base_points: 0,
            points_multiplier: sq.is_captain ? 200 : 100,
            points_breakdown: {},
            total_points: 0,
            did_not_play: true
          };
        }
      });

      // Also append any player who played for this team in aggregatedRoundPlayerDetails if not in squad list
      aggregatedRoundPlayerDetails
        .filter((p: any) => p.team_id === ft.team_id && !matchedIds.has(p.real_player_id))
        .forEach((p: any) => {
          players.push({
            ...p,
            did_not_play: false
          });
        });

      // Sort players: total_points DESC, captain first
      players.sort((a: any, b: any) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (a.is_captain) return -1;
        if (b.is_captain) return 1;
        return 0;
      });

      const player_points = pData ? Number(pData.player_points) : players.reduce((sum, p) => sum + Number(p.total_points || 0), 0);
      const passive_points = bData ? Number(bData.passive_points) : 0;
      const total_round_points = player_points + passive_points;

      let supporting_team_name = bData?.real_team_name;
      if (!supporting_team_name) {
        if (targetRound >= firstWindowStartRound) {
          const wonNew = postReleasePassiveWon.find((b: any) => b.team_id === ft.team_id);
          const wasRel = passiveReleases.find((r: any) => r.team_id === ft.team_id);
          if (wonNew) supporting_team_name = wonNew.target_name || wonNew.target_id;
          else if (wasRel) supporting_team_name = 'None (Released)';
          else supporting_team_name = initialSupportedTeamMap[ft.team_id] || ft.supported_team_name || 'N/A';
        } else {
          supporting_team_name = initialSupportedTeamMap[ft.team_id] || ft.supported_team_name || 'N/A';
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
        supporting_team_name,
        players,
        passive_breakdown: bData?.bonus_breakdown || null
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

    // Deduplicate & aggregate STOD rows per fantasy team
    const stodSeenMap = new Map<string, any>();
    stodRawRows.forEach((r: any) => {
      const existing = stodSeenMap.get(r.fantasy_team_id);
      if (!existing) {
        let bd: any = {};
        try {
          bd = typeof r.bonus_breakdown === 'string' ? JSON.parse(r.bonus_breakdown) : (r.bonus_breakdown || {});
        } catch (e) {
          bd = {};
        }
        stodSeenMap.set(r.fantasy_team_id, {
          ...r,
          supporting_points: Number(r.supporting_points || 0),
          bonus_breakdown: bd
        });
      } else {
        existing.supporting_points += Number(r.supporting_points || 0);
        let bd: any = {};
        try {
          bd = typeof r.bonus_breakdown === 'string' ? JSON.parse(r.bonus_breakdown) : (r.bonus_breakdown || {});
        } catch (e) {}
        Object.entries(bd).forEach(([k, v]) => {
          if (k === 'team_of_the_day' || k === 'team_of_the_week') {
            existing.bonus_breakdown[k] = Math.max(Number(existing.bonus_breakdown[k] || 0), Number(v || 0));
          } else {
            existing.bonus_breakdown[k] = (existing.bonus_breakdown[k] || 0) + Number(v || 0);
          }
        });
      }
    });
    const stodRows = Array.from(stodSeenMap.values());
    stodRows.sort((a, b) => Number(b.supporting_points) - Number(a.supporting_points));

    // 6. PLAYER OF THE DAY (POD): Drafted vs Free Agent players in target round (respecting window draft status in that round)
    const podRawRows = await fantasySql`
      SELECT 
        fpp.real_player_id,
        fpp.player_name,
        fpp.team_id as fantasy_team_id,
        ft.team_name as fantasy_team_name,
        ft.owner_name as fantasy_owner_name,
        fp.category,
        fp.position,
        fp.real_team_name,
        fpp.goals_scored,
        fpp.goals_conceded,
        fpp.result,
        fpp.is_motm,
        fpp.is_clean_sheet,
        fpp.is_captain,
        fpp.is_vice_captain,
        fpp.points_breakdown,
        COALESCE(fpp.base_points, 0) as base_points,
        COALESCE(fpp.total_points, 0) as total_points,
        opp_fp.player_name as opponent_name,
        opp_fp.category as opponent_category
      FROM fantasy_player_points fpp
      LEFT JOIN fantasy_teams ft ON fpp.team_id = ft.team_id
      LEFT JOIN fantasy_players fp ON ((fpp.real_player_id = fp.real_player_id OR fpp.real_player_id = fp.id::text) AND fp.league_id = ${leagueId})
      LEFT JOIN fantasy_players opp_fp ON ((fpp.points_breakdown->>'opponent_player_id' = opp_fp.real_player_id OR fpp.points_breakdown->>'opponent_player_id' = opp_fp.id::text) AND opp_fp.league_id = ${leagueId})
      WHERE fpp.league_id = ${leagueId} AND fpp.round_number = ${targetRound}
    `;

    // Deduplicate & aggregate POD rows per real_player_id for target round (handles multi-fixture rounds)
    const podMap = new Map<string, any>();
    podRawRows.forEach((r: any) => {
      let bd: any = {};
      try {
        bd = typeof r.points_breakdown === 'string' ? JSON.parse(r.points_breakdown || '{}') : (r.points_breakdown || {});
      } catch (e) {
        bd = {};
      }

      const matchItem = {
        goals_scored: Number(r.goals_scored || 0),
        goals_conceded: Number(r.goals_conceded || 0),
        result: r.result,
        opponent_name: r.opponent_name || null,
        opponent_category: r.opponent_category || null
      };

      const existing = podMap.get(r.real_player_id);
      if (!existing) {
        podMap.set(r.real_player_id, {
          ...r,
          category: r.category,
          goals_scored: Number(r.goals_scored || 0),
          goals_conceded: Number(r.goals_conceded || 0),
          base_points: Number(r.base_points || 0),
          total_points: Number(r.total_points || 0),
          points_breakdown: { ...bd },
          is_motm: !!r.is_motm,
          is_clean_sheet: !!r.is_clean_sheet,
          is_captain: !!r.is_captain,
          is_vice_captain: !!r.is_vice_captain,
          fixtures_count: 1,
          opponent_name: r.opponent_name || null,
          opponent_category: r.opponent_category || null,
          matches: [matchItem]
        });
      } else {
        existing.goals_scored += Number(r.goals_scored || 0);
        existing.goals_conceded += Number(r.goals_conceded || 0);
        existing.base_points += Number(r.base_points || 0);
        existing.total_points += Number(r.total_points || 0);
        existing.fixtures_count += 1;
        existing.matches.push(matchItem);
        if (!existing.opponent_name && r.opponent_name) {
          existing.opponent_name = r.opponent_name;
          existing.opponent_category = r.opponent_category;
        }
        if (r.is_motm) existing.is_motm = true;
        if (r.is_clean_sheet) existing.is_clean_sheet = true;
        if (r.is_captain) existing.is_captain = true;
        if (r.is_vice_captain) existing.is_vice_captain = true;
        if (bd && typeof bd === 'object') {
          Object.entries(bd).forEach(([k, v]) => {
            if (typeof v === 'number') {
              existing.points_breakdown[k] = (existing.points_breakdown[k] || 0) + v;
            } else if (!existing.points_breakdown[k]) {
              existing.points_breakdown[k] = v;
            }
          });
        }
        if ((!existing.fantasy_team_id || existing.fantasy_team_id === 'unassigned') && r.fantasy_team_id && r.fantasy_team_id !== 'unassigned') {
          existing.fantasy_team_id = r.fantasy_team_id;
          existing.fantasy_team_name = r.fantasy_team_name;
          existing.fantasy_owner_name = r.fantasy_owner_name;
        }
      }
    });

    const podRows = Array.from(podMap.values());
    podRows.sort((a: any, b: any) => {
      const diff = b.base_points - a.base_points;
      if (diff !== 0) return diff;
      return b.total_points - a.total_points;
    });

    const isDrafted = (p: any) => Boolean(p.fantasy_team_id) && p.fantasy_team_id !== 'unassigned';
    const draftedPOD = podRows.filter(isDrafted);
    const freeAgentPOD = podRows.filter((p: any) => !isDrafted(p));

    // 7. TEAM OF THE WEEK (TOW): Fantasy Team score across week block
    const startR = targetWeek.startRound;
    const endR = targetWeek.endRound;

    // Fetch Captain History for targetWeek (matching window containing startR)
    const weekCapWinRows = await fantasySql`
      SELECT window_id FROM fantasy_captain_windows
      WHERE league_id = ${leagueId} AND ${startR} >= start_round AND ${startR} <= end_round
      LIMIT 1
    `;
    const weekCapHistMap = new Map<string, any>();
    if (weekCapWinRows.length > 0 && weekCapWinRows[0].window_id) {
      const capHist = await fantasySql`
        SELECT team_id, captain_player_id, vice_captain_player_id
        FROM fantasy_captain_history
        WHERE league_id = ${leagueId} AND window_id = ${weekCapWinRows[0].window_id}
      `;
      capHist.forEach((c: any) => weekCapHistMap.set(c.team_id, c));
    }

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

    // Fetch detailed player points for week itemized breakdown
    const weekPlayerDetails = await fantasySql`
      SELECT 
        fpp.team_id,
        fpp.real_player_id,
        fpp.player_name,
        fp.category,
        fp.position,
        fp.real_team_name,
        fpp.goals_scored,
        fpp.goals_conceded,
        fpp.result,
        fpp.is_motm,
        fpp.is_clean_sheet,
        fpp.is_captain,
        fpp.is_vice_captain,
        fpp.base_points,
        fpp.points_multiplier,
        fpp.points_breakdown,
        fpp.total_points
      FROM fantasy_player_points fpp
      LEFT JOIN fantasy_players fp ON ((fpp.real_player_id = fp.real_player_id OR fpp.real_player_id = fp.id::text) AND fp.league_id = ${leagueId})
      WHERE fpp.league_id = ${leagueId} AND fpp.round_number BETWEEN ${startR} AND ${endR}
    `;

    const playerWeekAggMap = new Map<string, any>();
    weekPlayerDetails.forEach((p: any) => {
      const key = `${p.team_id}_${p.real_player_id}`;
      let bd: any = {};
      try {
        bd = typeof p.points_breakdown === 'string' ? JSON.parse(p.points_breakdown || '{}') : (p.points_breakdown || {});
      } catch (e) {
        bd = {};
      }

      const existing = playerWeekAggMap.get(key);
      if (!existing) {
        playerWeekAggMap.set(key, {
          team_id: p.team_id,
          real_player_id: p.real_player_id,
          player_name: p.player_name,
          category: p.category,
          goals_scored: Number(p.goals_scored || 0),
          goals_conceded: Number(p.goals_conceded || 0),
          base_points: Number(p.base_points || 0),
          total_points: Number(p.total_points || 0),
          is_motm: !!p.is_motm,
          is_clean_sheet: !!p.is_clean_sheet,
          is_captain: !!p.is_captain,
          is_vice_captain: !!p.is_vice_captain,
          points_breakdown: { ...bd },
          matches_played: 1,
        });
      } else {
        existing.goals_scored += Number(p.goals_scored || 0);
        existing.goals_conceded += Number(p.goals_conceded || 0);
        existing.base_points += Number(p.base_points || 0);
        existing.total_points += Number(p.total_points || 0);
        existing.matches_played += 1;
        if (p.is_motm) existing.is_motm = true;
        if (p.is_clean_sheet) existing.is_clean_sheet = true;
        if (p.is_captain) existing.is_captain = true;
        if (p.is_vice_captain) existing.is_vice_captain = true;

        if (bd && typeof bd === 'object') {
          Object.entries(bd).forEach(([k, v]) => {
            if (typeof v === 'number') {
              existing.points_breakdown[k] = (existing.points_breakdown[k] || 0) + v;
            } else if (!existing.points_breakdown[k]) {
              existing.points_breakdown[k] = v;
            }
          });
        }
      }
    });

    // Fetch team passive bonus points for week itemized breakdown
    const bonusWeekPtsRows = await fantasySql`
      SELECT 
        team_id,
        real_team_name,
        total_bonus,
        bonus_breakdown
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId} AND round_number BETWEEN ${startR} AND ${endR}
    `;
    const teamBonusAggMap = new Map<string, any>();
    bonusWeekPtsRows.forEach((r: any) => {
      let bd: any = {};
      try {
        bd = typeof r.bonus_breakdown === 'string' ? JSON.parse(r.bonus_breakdown || '{}') : (r.bonus_breakdown || {});
      } catch (e) {
        bd = {};
      }

      const existing = teamBonusAggMap.get(r.team_id);
      if (!existing) {
        teamBonusAggMap.set(r.team_id, {
          team_id: r.team_id,
          real_team_name: r.real_team_name,
          passive_points: Number(r.total_bonus || 0),
          bonus_breakdown: { ...bd }
        });
      } else {
        existing.passive_points += Number(r.total_bonus || 0);
        if (r.real_team_name && !existing.real_team_name) existing.real_team_name = r.real_team_name;
        if (bd && typeof bd === 'object') {
          Object.entries(bd).forEach(([k, v]) => {
            existing.bonus_breakdown[k] = (existing.bonus_breakdown[k] || 0) + Number(v || 0);
          });
        }
      }
    });

    const towRows = allTeams.map((ft: any) => {
      const pData = playerWeekPtsMap[ft.team_id];
      const bData = teamBonusAggMap.get(ft.team_id);

      let squadList: any[] = [];
      if (startR < firstWindowStartRound) {
        const retained = currentSquad.filter((s: any) => s.team_id === ft.team_id && s.acquisition_type !== 'post_release_draft');
        const rel = releases.filter((r: any) => r.team_id === ft.team_id);
        squadList = [...retained, ...rel];
      } else {
        squadList = currentSquad.filter((s: any) => s.team_id === ft.team_id);
      }

      const cap = weekCapHistMap.get(ft.team_id);
      squadList = squadList.map((p: any) => {
        const isCaptain = cap ? cap.captain_player_id === p.real_player_id : !!p.is_captain;
        const isViceCaptain = cap ? cap.vice_captain_player_id === p.real_player_id : !!p.is_vice_captain;
        return {
          ...p,
          is_captain: isCaptain,
          is_vice_captain: isViceCaptain
        };
      });

      const matchedIds = new Set<string>();
      const players = squadList.map((sq: any) => {
        matchedIds.add(sq.real_player_id);
        const agg = playerWeekAggMap.get(`${ft.team_id}_${sq.real_player_id}`);
        if (agg) {
          return {
            ...agg,
            player_name: agg.player_name || sq.player_name,
            is_captain: sq.is_captain || agg.is_captain,
            is_vice_captain: sq.is_vice_captain || agg.is_vice_captain,
            did_not_play: false
          };
        } else {
          return {
            team_id: ft.team_id,
            real_player_id: sq.real_player_id,
            player_name: sq.player_name,
            category: sq.category || null,
            position: sq.position,
            goals_scored: 0,
            goals_conceded: 0,
            result: 'dnp',
            is_motm: false,
            is_clean_sheet: false,
            is_captain: sq.is_captain,
            is_vice_captain: sq.is_vice_captain,
            base_points: 0,
            points_multiplier: sq.is_captain ? 200 : 100,
            points_breakdown: {},
            total_points: 0,
            did_not_play: true
          };
        }
      });

      // Also append any player who played for this team in playerWeekAggMap if not in squad list
      Array.from(playerWeekAggMap.values())
        .filter((p: any) => p.team_id === ft.team_id && !matchedIds.has(p.real_player_id))
        .forEach((p: any) => {
          players.push({
            ...p,
            did_not_play: false
          });
        });

      // Sort players: total_points DESC, captain first
      players.sort((a: any, b: any) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (a.is_captain) return -1;
        if (b.is_captain) return 1;
        return 0;
      });

      let supporting_team_name = bData?.real_team_name;
      if (!supporting_team_name) {
        if (startR >= firstWindowStartRound) {
          const wonNew = postReleasePassiveWon.find((b: any) => b.team_id === ft.team_id);
          const wasRel = passiveReleases.find((r: any) => r.team_id === ft.team_id);
          if (wonNew) supporting_team_name = wonNew.target_name || wonNew.target_id;
          else if (wasRel) supporting_team_name = 'None (Released)';
          else supporting_team_name = initialSupportedTeamMap[ft.team_id] || ft.supported_team_name || 'N/A';
        } else {
          supporting_team_name = initialSupportedTeamMap[ft.team_id] || ft.supported_team_name || 'N/A';
        }
      }

      const player_points = pData ? Number(pData.player_points) : players.reduce((sum, p) => sum + Number(p.total_points || 0), 0);
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
        clean_sheets: pData ? Number(pData.clean_sheets) : 0,
        supporting_team_name,
        players,
        passive_breakdown: bData?.bonus_breakdown || null
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

    // 9. PLAYER OF THE WEEK (POW): Drafted vs Free Agent players across week block
    const powDetails = await fantasySql`
      SELECT 
        fpp.real_player_id,
        fpp.player_name,
        fpp.team_id as fantasy_team_id,
        ft.team_name as fantasy_team_name,
        ft.owner_name as fantasy_owner_name,
        fp.category,
        fp.position,
        fp.real_team_name,
        fpp.round_number,
        fpp.goals_scored,
        fpp.goals_conceded,
        fpp.result,
        fpp.is_motm,
        fpp.is_clean_sheet,
        fpp.is_captain,
        fpp.is_vice_captain,
        fpp.base_points,
        fpp.points_multiplier,
        fpp.points_breakdown,
        fpp.total_points,
        opp_fp.player_name as opponent_name,
        opp_fp.category as opponent_category
      FROM fantasy_player_points fpp
      LEFT JOIN fantasy_teams ft ON fpp.team_id = ft.team_id
      LEFT JOIN fantasy_players fp ON ((fpp.real_player_id = fp.real_player_id OR fpp.real_player_id = fp.id::text) AND fp.league_id = ${leagueId})
      LEFT JOIN fantasy_players opp_fp ON ((fpp.points_breakdown->>'opponent_player_id' = opp_fp.real_player_id OR fpp.points_breakdown->>'opponent_player_id' = opp_fp.id::text) AND opp_fp.league_id = ${leagueId})
      WHERE fpp.league_id = ${leagueId} AND fpp.round_number BETWEEN ${startR} AND ${endR}
      ORDER BY fpp.round_number ASC
    `;

    // Deduplicate & aggregate POW rows per real_player_id with cumulative breakdown & round-by-round history
    const powMap = new Map<string, any>();
    powDetails.forEach((p: any) => {
      let bd: any = {};
      try {
        bd = typeof p.points_breakdown === 'string' ? JSON.parse(p.points_breakdown || '{}') : (p.points_breakdown || {});
      } catch (e) {
        bd = {};
      }

      const existing = powMap.get(p.real_player_id);
      const roundItem = {
        round_number: Number(p.round_number),
        base_points: Number(p.base_points || 0),
        total_points: Number(p.total_points || 0),
        goals_scored: Number(p.goals_scored || 0),
        goals_conceded: Number(p.goals_conceded || 0),
        is_motm: !!p.is_motm,
        is_clean_sheet: !!p.is_clean_sheet,
        result: p.result,
        opponent_name: p.opponent_name || null,
        opponent_category: p.opponent_category || null,
        breakdown: bd
      };

      if (!existing) {
        powMap.set(p.real_player_id, {
          real_player_id: p.real_player_id,
          player_name: p.player_name,
          fantasy_team_id: p.fantasy_team_id,
          fantasy_team_name: p.fantasy_team_name,
          fantasy_owner_name: p.fantasy_owner_name,
          category: p.category,
          position: p.position,
          real_team_name: p.real_team_name,
          total_goals: Number(p.goals_scored || 0),
          player_base_points: Number(p.base_points || 0),
          player_total_points: Number(p.total_points || 0),
          matches_played: 1,
          points_breakdown: { ...bd },
          rounds: [roundItem]
        });
      } else {
        existing.total_goals += Number(p.goals_scored || 0);
        existing.player_base_points += Number(p.base_points || 0);
        existing.player_total_points += Number(p.total_points || 0);
        existing.matches_played += 1;
        existing.rounds.push(roundItem);

        if ((!existing.fantasy_team_id || existing.fantasy_team_id === 'unassigned') && p.fantasy_team_id && p.fantasy_team_id !== 'unassigned') {
          existing.fantasy_team_id = p.fantasy_team_id;
          existing.fantasy_team_name = p.fantasy_team_name;
          existing.fantasy_owner_name = p.fantasy_owner_name;
        }

        if (bd && typeof bd === 'object') {
          Object.entries(bd).forEach(([k, v]) => {
            if (typeof v === 'number') {
              existing.points_breakdown[k] = (existing.points_breakdown[k] || 0) + v;
            } else if (!existing.points_breakdown[k]) {
              existing.points_breakdown[k] = v;
            }
          });
        }
      }
    });

    const powRows = Array.from(powMap.values());
    powRows.sort((a: any, b: any) => {
      const diff = b.player_base_points - a.player_base_points;
      if (diff !== 0) return diff;
      return b.player_total_points - a.player_total_points;
    });

    const draftedPOW = powRows.filter(isDrafted);
    const freeAgentPOW = powRows.filter((p: any) => !isDrafted(p));

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
