import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getPlayerPhotosMap } from '@/lib/fantasy/photos';

/**
 * GET /api/fantasy/teams/[teamId]
 * Get fantasy team details with drafted players and points history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    console.log('[Team API] Fetching team with ID:', teamId);

    if (!teamId) {
      console.error('[Team API] Team ID is missing');
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

    // Get fantasy team from PostgreSQL
    const teams = await fantasySql`
      SELECT * FROM fantasy_teams
      WHERE team_id = ${teamId}
      LIMIT 1
    `;

    console.log('[Team API] Teams found:', teams.length);

    if (teams.length === 0) {
      console.error('[Team API] Fantasy team not found for ID:', teamId);
      return NextResponse.json(
        { error: 'Fantasy team not found' },
        { status: 404 }
      );
    }

    const teamData = teams[0];
    const targetLeagueId = teamData.league_id || teamData.fantasy_league_id || 'SSPSLFLS18';

    const { searchParams } = new URL(request.url);
    const startRoundParam = searchParams.get('start_round');
    const endRoundParam = searchParams.get('end_round');
    const startRound = startRoundParam ? parseInt(startRoundParam, 10) : null;
    const endRound = endRoundParam ? parseInt(endRoundParam, 10) : null;

    // Detect rounds and build available_windows dynamically
    const roundsRows = await fantasySql`
      SELECT DISTINCT round_number 
      FROM (
        SELECT round_number FROM fantasy_player_points WHERE league_id = ${targetLeagueId}
        UNION
        SELECT round_number FROM fantasy_team_bonus_points WHERE league_id = ${targetLeagueId}
      ) t
      ORDER BY round_number ASC
    `;
    const availableRounds = roundsRows.map((r: any) => Number(r.round_number)).filter(Boolean);
    const maxRound = availableRounds.length > 0 ? Math.max(...availableRounds) : 1;

    // Query captain/transfer windows
    const capWindows = await fantasySql`
      SELECT window_id, round_name, start_round, end_round
      FROM fantasy_captain_windows
      WHERE league_id = ${targetLeagueId} AND start_round IS NOT NULL AND end_round IS NOT NULL
      ORDER BY start_round ASC
    `;

    const availableWindows: Array<{
      id: string;
      label: string;
      start_round: number | null;
      end_round: number | null;
      is_current?: boolean;
    }> = [
      {
        id: 'all',
        label: `All Rounds (1–${maxRound})`,
        start_round: null,
        end_round: null,
        is_current: startRound === null && endRound === null
      }
    ];

    if (capWindows.length > 0) {
      capWindows.forEach((cw: any, idx: number) => {
        const s = Number(cw.start_round);
        const e = Number(cw.end_round);
        const isSelected = startRound === s && endRound === e;
        availableWindows.push({
          id: `win_${idx + 1}`,
          label: `Week ${idx + 1} (Rounds ${s}–${e})`,
          start_round: s,
          end_round: e,
          is_current: isSelected
        });
      });
    } else {
      const totalWeeksCount = Math.max(1, Math.ceil(maxRound / 6));
      for (let w = 1; w <= totalWeeksCount; w++) {
        const s = (w - 1) * 6 + 1;
        const e = w * 6;
        availableWindows.push({
          id: `week_${w}`,
          label: `Week ${w} (Rounds ${s}–${e})`,
          start_round: s,
          end_round: e,
          is_current: startRound === s && endRound === e
        });
      }
    }

    // Determine first transfer window start round
    const firstWinRows = await fantasySql`
      SELECT MIN(start_round) as first_start
      FROM fantasy_transfer_windows
      WHERE league_id = ${targetLeagueId} AND start_round IS NOT NULL
    `;
    const firstWindowStartRound = Number(firstWinRows[0]?.first_start || 7);

    // Resolve captaincy for the selected window
    let windowCaptainId: string | null = null;
    let windowViceCaptainId: string | null = null;
    if (startRound !== null && endRound !== null) {
      const capWinRows = await fantasySql`
        SELECT window_id FROM fantasy_captain_windows
        WHERE league_id = ${targetLeagueId} AND ${startRound} >= start_round AND ${startRound} <= end_round
        LIMIT 1
      `;
      if (capWinRows.length > 0 && capWinRows[0].window_id) {
        const capHist = await fantasySql`
          SELECT captain_player_id, vice_captain_player_id
          FROM fantasy_captain_history
          WHERE league_id = ${targetLeagueId} AND team_id = ${teamId} AND window_id = ${capWinRows[0].window_id}
          LIMIT 1
        `;
        if (capHist.length > 0) {
          windowCaptainId = capHist[0].captain_player_id;
          windowViceCaptainId = capHist[0].vice_captain_player_id;
        }
      }
    }

    // Reconstruct squad based on window
    let rawPlayers: any[] = [];
    if (endRound !== null && endRound < firstWindowStartRound) {
      // Pre-window (retained players + released players)
      const retained = await fantasySql`
        SELECT fs.squad_id, fs.real_player_id, fs.player_name, COALESCE(fp.category, fs.position, 'Unknown') as category,
               fs.position, fs.real_team_name, fs.purchase_price, fs.is_captain, fs.is_vice_captain, false as is_released
        FROM fantasy_squad fs
        LEFT JOIN fantasy_players fp ON (fs.real_player_id = fp.real_player_id AND fs.league_id = fp.league_id)
        WHERE fs.team_id = ${teamId} AND (fs.acquisition_type IS NULL OR fs.acquisition_type != 'post_release_draft')
      `;
      const released = await fantasySql`
        SELECT fr.release_id as squad_id, fr.real_player_id, fr.player_name, COALESCE(fr.category, fp.position, 'Unknown') as category,
               fp.position, fp.real_team_name, fr.purchase_price, false as is_captain, false as is_vice_captain,
               true as is_released
        FROM fantasy_releases fr
        LEFT JOIN fantasy_players fp ON (fr.real_player_id = fp.real_player_id AND fr.league_id = fp.league_id)
        WHERE fr.team_id = ${teamId} AND fr.league_id = ${targetLeagueId} AND fr.is_passive_team = false
      `;
      rawPlayers = [...retained, ...released];
    } else if (startRound !== null && startRound >= firstWindowStartRound) {
      // Post-window squad
      rawPlayers = await fantasySql`
        SELECT fs.squad_id, fs.real_player_id, fs.player_name, COALESCE(fp.category, fs.position, 'Unknown') as category,
               fs.position, fs.real_team_name, fs.purchase_price, fs.is_captain, fs.is_vice_captain, false as is_released
        FROM fantasy_squad fs
        LEFT JOIN fantasy_players fp ON (fs.real_player_id = fp.real_player_id AND fs.league_id = fp.league_id)
        WHERE fs.team_id = ${teamId}
      `;
    } else {
      // All rounds (current squad + released players who scored for this team)
      const current = await fantasySql`
        SELECT fs.squad_id, fs.real_player_id, fs.player_name, COALESCE(fp.category, fs.position, 'Unknown') as category,
               fs.position, fs.real_team_name, fs.purchase_price, fs.is_captain, fs.is_vice_captain, false as is_released
        FROM fantasy_squad fs
        LEFT JOIN fantasy_players fp ON (fs.real_player_id = fp.real_player_id AND fs.league_id = fp.league_id)
        WHERE fs.team_id = ${teamId}
      `;
      const pastReleases = await fantasySql`
        SELECT fr.release_id as squad_id, fr.real_player_id, fr.player_name, COALESCE(fr.category, fp.position, 'Unknown') as category,
               fp.position, fp.real_team_name, fr.purchase_price, false as is_captain, false as is_vice_captain,
               true as is_released
        FROM fantasy_releases fr
        LEFT JOIN fantasy_players fp ON (fr.real_player_id = fp.real_player_id AND fr.league_id = fp.league_id)
        WHERE fr.team_id = ${teamId} AND fr.league_id = ${targetLeagueId} AND fr.is_passive_team = false
      `;
      rawPlayers = [...current, ...pastReleases];
    }

    // Build player sub-group map from league category_settings
    const playerSubgroupMap: Record<string, string> = {};
    if (rawPlayers.length > 0) {
      try {
        const leagues = await fantasySql`
          SELECT category_settings FROM fantasy_leagues
          WHERE league_id = ${targetLeagueId}
          LIMIT 1
        `;
        if (leagues.length > 0 && leagues[0].category_settings) {
          const cs = typeof leagues[0].category_settings === 'string'
            ? JSON.parse(leagues[0].category_settings)
            : leagues[0].category_settings;
          const slotNameMap: Record<string, string> = {};
          (cs.slots || []).forEach((s: any) => {
            slotNameMap[s.list_id] = s.name;
          });
          if (cs.lists) {
            Object.entries(cs.lists).forEach(([listId, pids]: [string, any]) => {
              const subName = slotNameMap[listId] || listId;
              if (Array.isArray(pids)) {
                pids.forEach((pid: string) => {
                  playerSubgroupMap[pid] = subName;
                });
              }
            });
          }
        }
      } catch (e) {
        console.error('Error resolving category subgroups in team API:', e);
      }
    }

    // Fetch player photos map
    const photosMap = await getPlayerPhotosMap();

    // Get statistics for each player in this window
    const draftedPlayers = await Promise.all(
      rawPlayers.map(async (player: any) => {
        let matchesQuery: any = null;
        if (startRound !== null && endRound !== null) {
          matchesQuery = await fantasySql`
            SELECT 
              COUNT(*) as matches_played,
              COALESCE(SUM(total_points), 0) as total_match_points,
              COALESCE(SUM(goals_scored), 0) as goals,
              COUNT(CASE WHEN is_clean_sheet = true THEN 1 END) as clean_sheets,
              COUNT(CASE WHEN is_motm = true THEN 1 END) as motm
            FROM fantasy_player_points
            WHERE team_id = ${teamId}
              AND real_player_id = ${player.real_player_id}
              AND round_number BETWEEN ${startRound} AND ${endRound}
          `;
        } else {
          matchesQuery = await fantasySql`
            SELECT 
              COUNT(*) as matches_played,
              COALESCE(SUM(total_points), 0) as total_match_points,
              COALESCE(SUM(goals_scored), 0) as goals,
              COUNT(CASE WHEN is_clean_sheet = true THEN 1 END) as clean_sheets,
              COUNT(CASE WHEN is_motm = true THEN 1 END) as motm
            FROM fantasy_player_points
            WHERE team_id = ${teamId}
              AND real_player_id = ${player.real_player_id}
          `;
        }

        const matchesPlayed = Number(matchesQuery[0]?.matches_played || 0);
        const totalPoints = Number(matchesQuery[0]?.total_match_points || 0);
        const isCaptain = windowCaptainId ? (windowCaptainId === player.real_player_id) : !!player.is_captain;
        const isViceCaptain = windowViceCaptainId ? (windowViceCaptainId === player.real_player_id) : !!player.is_vice_captain;
        const averagePoints = matchesPlayed > 0 ? totalPoints / matchesPlayed : 0;

        return {
          draft_id: player.squad_id,
          real_player_id: player.real_player_id,
          player_name: player.player_name,
          category: playerSubgroupMap[player.real_player_id] || player.category || 'Unknown',
          position: player.position,
          real_team_name: player.real_team_name,
          purchase_price: Number(player.purchase_price),
          total_points: totalPoints,
          matches_played: matchesPlayed,
          goals_scored: Number(matchesQuery[0]?.goals || 0),
          clean_sheets: Number(matchesQuery[0]?.clean_sheets || 0),
          motm: Number(matchesQuery[0]?.motm || 0),
          average_points: Math.round(averagePoints * 10) / 10,
          is_captain: isCaptain,
          is_vice_captain: isViceCaptain,
          is_released: !!player.is_released,
          photo_url: photosMap[player.real_player_id] || null,
        };
      })
    );

    // Sort players: total_points DESC, captain first
    draftedPlayers.sort((a: any, b: any) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (a.is_captain) return -1;
      if (b.is_captain) return 1;
      return 0;
    });

    // Resolve supported team name for this window
    let supportedTeamName = teamData.supported_team_name || null;
    let supportedTeamId = teamData.supported_team_id || null;

    if (endRound !== null && endRound < firstWindowStartRound) {
      // Pre-window supported team from slot 6 draft bid
      const slot6Bids = await fantasySql`
        SELECT fdb.target_id, ft.team_name as target_team_name
        FROM fantasy_draft_bids fdb
        LEFT JOIN fantasy_teams ft ON (
          fdb.target_id = ft.team_id 
          OR fdb.target_id LIKE (ft.team_id || '_%')
          OR ft.team_id = SPLIT_PART(fdb.target_id, '_', 1)
        )
        WHERE fdb.team_id = ${teamId} AND fdb.league_id = ${targetLeagueId} AND fdb.slot_index = 6 AND fdb.status = 'won'
        LIMIT 1
      `;
      if (slot6Bids.length > 0) {
        supportedTeamId = slot6Bids[0].target_id;
        let sName = slot6Bids[0].target_team_name;
        const raw = (supportedTeamId || '').toUpperCase();
        if (!sName || sName === supportedTeamId || sName.startsWith('SSPSLT')) {
          if (raw.includes('SSPSLT0018')) sName = 'TITANS FC';
          else if (raw.includes('SSPSLT0015')) sName = 'LEGENDS FC';
          else if (raw.includes('SSPSLT0021')) sName = 'LOS GALACTICOS';
          else if (raw.includes('SSPSLT0005')) sName = 'TM ASGARDIANS';
          else if (raw.includes('SSPSLT0006')) sName = 'PES GUARDIANS';
          else if (raw.includes('SSPSLT0001')) sName = 'CLASSIC TENS';
          else if (raw.includes('SSPSLT0041')) sName = 'ANDIMUKK FC';
          else if (raw.includes('SSPSLT0027')) sName = 'PES GUARDIANS';
          else if (raw.includes('SSPSLT0003')) sName = 'RED PANTHERS';
          else if (raw.includes('SSPSLT0004')) sName = 'RED HAWKS FC';
          else sName = supportedTeamId;
        }
        supportedTeamName = sName;
      }
    } else if (startRound !== null && startRound >= firstWindowStartRound) {
      // Check post-release won passive bid
      const postReleasePassiveWon = await fantasySql`
        SELECT fprb.target_id, fprb.target_name
        FROM fantasy_post_release_bids fprb
        WHERE fprb.team_id = ${teamId} AND fprb.league_id = ${targetLeagueId} AND fprb.status = 'won' AND (fprb.is_passive_team = true OR fprb.category ILIKE '%passive%')
        LIMIT 1
      `;
      if (postReleasePassiveWon.length > 0) {
        supportedTeamId = postReleasePassiveWon[0].target_id;
        supportedTeamName = postReleasePassiveWon[0].target_name;
      }
    }

    // Resolve passive points for this window
    let passivePoints = 0;
    if (startRound !== null && endRound !== null) {
      const bRes = await fantasySql`
        SELECT COALESCE(SUM(total_bonus), 0) as passive_points
        FROM fantasy_team_bonus_points
        WHERE team_id = ${teamId} AND league_id = ${targetLeagueId} AND round_number BETWEEN ${startRound} AND ${endRound}
      `;
      passivePoints = Number(bRes[0]?.passive_points || 0);
    } else {
      const bRes = await fantasySql`
        SELECT COALESCE(SUM(total_bonus), 0) as passive_points
        FROM fantasy_team_bonus_points
        WHERE team_id = ${teamId} AND league_id = ${targetLeagueId}
      `;
      passivePoints = Number(bRes[0]?.passive_points || 0);
    }

    const totalPlayerPoints = draftedPlayers.reduce((sum: number, p: any) => sum + p.total_points, 0);
    const windowTotalPoints = totalPlayerPoints + passivePoints;

    // Calculate window rank among all teams if window specified
    let windowRank = teamData.rank;
    if (startRound !== null && endRound !== null) {
      const allPlayerPoints = await fantasySql`
        SELECT team_id, COALESCE(SUM(total_points), 0) as p_points
        FROM fantasy_player_points
        WHERE league_id = ${targetLeagueId} AND round_number BETWEEN ${startRound} AND ${endRound}
        GROUP BY team_id
      `;
      const allBonusPoints = await fantasySql`
        SELECT team_id, COALESCE(SUM(total_bonus), 0) as b_points
        FROM fantasy_team_bonus_points
        WHERE league_id = ${targetLeagueId} AND round_number BETWEEN ${startRound} AND ${endRound}
        GROUP BY team_id
      `;
      const pMap = Object.fromEntries(allPlayerPoints.map((p: any) => [p.team_id, Number(p.p_points)]));
      const bMap = Object.fromEntries(allBonusPoints.map((b: any) => [b.team_id, Number(b.b_points)]));
      const allTeams = await fantasySql`SELECT team_id FROM fantasy_teams WHERE league_id = ${targetLeagueId}`;
      const sorted = allTeams.map((t: any) => ({
        id: t.team_id,
        score: (pMap[t.team_id] || 0) + (bMap[t.team_id] || 0)
      })).sort((a: any, b: any) => b.score - a.score);
      const rIdx = sorted.findIndex((t: any) => t.id === teamId);
      if (rIdx >= 0) windowRank = rIdx + 1;
    }

    // Get recent points by round (last 5 rounds)
    let recentRoundsQuery: any = null;
    if (startRound !== null && endRound !== null) {
      recentRoundsQuery = await fantasySql`
        SELECT 
          fpp.round_number,
          SUM(fpp.total_points) as points
        FROM fantasy_player_points fpp
        WHERE fpp.team_id = ${teamId} AND fpp.league_id = ${targetLeagueId} AND fpp.round_number BETWEEN ${startRound} AND ${endRound}
        GROUP BY fpp.round_number
        ORDER BY fpp.round_number DESC
      `;
    } else {
      recentRoundsQuery = await fantasySql`
        SELECT 
          fpp.round_number,
          SUM(fpp.total_points) as points
        FROM fantasy_player_points fpp
        WHERE fpp.team_id = ${teamId} AND fpp.league_id = ${targetLeagueId}
        GROUP BY fpp.round_number
        ORDER BY fpp.round_number DESC
        LIMIT 5
      `;
    }

    const recentRounds = recentRoundsQuery.map((r: any) => ({
      round: r.round_number,
      points: Number(r.points),
    }));

    return NextResponse.json({
      success: true,
      team: {
        id: teamData.team_id,
        team_name: teamData.team_name,
        owner_name: teamData.owner_name,
        total_points: windowTotalPoints,
        player_points: totalPlayerPoints,
        passive_points: passivePoints,
        rank: windowRank,
        budget_remaining: Number(teamData.budget_remaining || 0),
        supported_team_id: supportedTeamId,
        supported_team_name: supportedTeamName,
        supported_team_price: Number(teamData.supported_team_price || 0),
      },
      players: draftedPlayers,
      available_windows: availableWindows,
      selected_window: {
        start_round: startRound,
        end_round: endRound
      },
      recent_rounds: recentRounds,
      statistics: {
        total_players: draftedPlayers.length,
        total_points: windowTotalPoints,
        average_points_per_player: draftedPlayers.length > 0 
          ? Math.round((totalPlayerPoints / draftedPlayers.length) * 10) / 10 
          : 0,
      }
    });
  } catch (error: any) {
    console.error('[Team API] Error fetching fantasy team:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fantasy team', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

