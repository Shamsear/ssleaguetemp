import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * POST /api/admin/fantasy/recalculate-all-points
 * Complete recalculation of Season 18 fantasy points with transfer window awareness
 */
export async function POST(request: NextRequest) {
  try {
    const fantasyDb = getFantasyDb();
    const tournamentDb = getTournamentDb();

    console.log('🎮 Starting Complete Fantasy Points Recalculation for Season 18...');

    const LEAGUE_ID = 'SSPSLFLS18';
    const SEASON_ID = 'SSPSLS18';

    const results = {
      playerPointsInserted: 0,
      passiveBonusesAwarded: 0,
      squadPlayersUpdated: 0,
      teamsUpdated: 0,
      leaguesRanked: 0,
    };

    // Load Scoring Rules
    const scoringRulesData = await fantasyDb`
      SELECT rule_type, points_value, applies_to
      FROM fantasy_scoring_rules
      WHERE is_active = true AND (league_id = ${LEAGUE_ID} OR league_id IS NULL)
    `;

    const SCORING_RULES: Record<string, number> = {};
    const TEAM_SCORING_RULES = new Map<string, number>();
    scoringRulesData.forEach((rule: any) => {
      if (rule.applies_to === 'player') {
        SCORING_RULES[rule.rule_type.toLowerCase()] = Number(rule.points_value);
      } else if (rule.applies_to === 'team') {
        TEAM_SCORING_RULES.set(rule.rule_type.toLowerCase(), Number(rule.points_value));
      }
    });

    // Get Season 18 Completed Fixtures and Matchups
    const fixtures = await tournamentDb`
      SELECT id as fixture_id, season_id, round_number, home_team_id, away_team_id, home_score, away_score, motm_player_id
      FROM fixtures
      WHERE status = 'completed' AND season_id = ${SEASON_ID}
      ORDER BY round_number
    `;

    const fixtureMap = new Map();
    fixtures.forEach((f: any) => fixtureMap.set(f.fixture_id, f));

    const matchups = await tournamentDb`
      SELECT 
        m.fixture_id,
        m.home_player_id, m.home_player_name,
        m.away_player_id, m.away_player_name,
        m.home_goals, m.away_goals,
        COALESCE(rps_home.category, 'Red') as home_category,
        COALESCE(rps_away.category, 'Red') as away_category
      FROM matchups m
      JOIN fixtures f ON m.fixture_id = f.id
      LEFT JOIN realplayerstats rps_home ON (m.home_player_id = rps_home.player_id AND f.season_id = rps_home.season_id)
      LEFT JOIN realplayerstats rps_away ON (m.away_player_id = rps_away.player_id AND f.season_id = rps_away.season_id)
      WHERE f.status = 'completed' AND f.season_id = ${SEASON_ID} AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
    `;

    // Load Draft Bids (for Rounds 1-6), Releases, and Current Squad (for Rounds 7+)
    const draftBids = await fantasyDb`
      SELECT team_id, slot_index, target_id 
      FROM fantasy_draft_bids 
      WHERE league_id = ${LEAGUE_ID} AND status = 'won'
    `;
    const releases = await fantasyDb`
      SELECT team_id, real_player_id, player_name, is_passive_team
      FROM fantasy_releases
      WHERE league_id = ${LEAGUE_ID}
    `;
    const currentSquad = await fantasyDb`
      SELECT team_id, real_player_id, player_name, is_captain, is_vice_captain, acquisition_type 
      FROM fantasy_squad 
      WHERE league_id = ${LEAGUE_ID}
    `;
    const currentTeams = await fantasyDb`
      SELECT team_id, team_name, owner_name, supported_team_id, supported_team_name 
      FROM fantasy_teams 
      WHERE league_id = ${LEAGUE_ID}
    `;
    const captainWindows = await fantasyDb`
      SELECT window_id, league_id, start_round, end_round 
      FROM fantasy_captain_windows 
      WHERE league_id = ${LEAGUE_ID}
    `;
    const captainHistory = await fantasyDb`
      SELECT league_id, team_id, window_id, captain_player_id, vice_captain_player_id, changed_at 
      FROM fantasy_captain_history 
      WHERE league_id = ${LEAGUE_ID} 
      ORDER BY changed_at DESC
    `;

    // Load Awards for Season 18 (POTD, POTW, TOD, TOW)
    const awards = await tournamentDb`
      SELECT award_type, round_number, week_number, player_id, team_id
      FROM awards
      WHERE season_id = ${SEASON_ID}
    `;
    console.log(`🏆 Loaded ${awards.length} awards for Season 18`);

    const draftSquads = new Map<string, Set<string>>();
    const draftSupportedTeams = new Map<string, string>();
    currentTeams.forEach((t: any) => draftSquads.set(t.team_id, new Set()));

    // 1. Retained players from original draft
    currentSquad.filter((s: any) => s.acquisition_type !== 'post_release_draft').forEach((s: any) => {
      draftSquads.get(s.team_id)?.add(s.real_player_id);
    });

    // 2. Released players (they belonged to that team for rounds 1-6)
    releases.filter((r: any) => !r.is_passive_team).forEach((r: any) => {
      draftSquads.get(r.team_id)?.add(r.real_player_id);
    });

    // 3. Draft bids fallback
    draftBids.forEach((bid: any) => {
      if (bid.slot_index >= 1 && bid.slot_index <= 5) {
        if (!draftSquads.has(bid.team_id)) draftSquads.set(bid.team_id, new Set());
        draftSquads.get(bid.team_id)!.add(bid.target_id);
      } else if (bid.slot_index === 6) {
        draftSupportedTeams.set(bid.team_id, bid.target_id);
      }
    });

    const postWindowSquads = new Map<string, Set<string>>();
    currentSquad.forEach((row: any) => {
      if (!postWindowSquads.has(row.team_id)) postWindowSquads.set(row.team_id, new Set());
      postWindowSquads.get(row.team_id)!.add(row.real_player_id);
    });

    const getCategoryResultPts = (oppCat: string, outcome: string): number => {
      const cat = (oppCat || '').toLowerCase();
      if (cat.includes('red') || cat === 'r')   return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3);
      if (cat.includes('black'))                 return outcome === 'win' ? 7 : (outcome === 'draw' ? 3 : -4);
      if (cat.includes('blue') || cat === 'b')  return outcome === 'win' ? 6 : (outcome === 'draw' ? 2 : -5);
      if (cat.includes('white') || cat === 'w') return outcome === 'win' ? 5 : (outcome === 'draw' ? 1 : -6);
      return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3);
    };

    // STEP 1: Clear existing S18 point records
    console.log('🧹 Clearing existing S18 point records...');
    await fantasyDb`DELETE FROM fantasy_player_points WHERE league_id = ${LEAGUE_ID}`;
    await fantasyDb`DELETE FROM fantasy_team_bonus_points WHERE league_id = ${LEAGUE_ID}`;

    // STEP 2: Calculate & Insert Player Points
    console.log('⚽ Recalculating and inserting player points...');
    const playerBasePointsMap = new Map<string, number>();

    for (const matchup of matchups as any[]) {
      const fixture = fixtureMap.get(matchup.fixture_id);
      if (!fixture) continue;
      const roundNum = fixture.round_number;

      for (const playerSide of ['home', 'away']) {
        const playerId = playerSide === 'home' ? matchup.home_player_id : matchup.away_player_id;
        const playerName = playerSide === 'home' ? matchup.home_player_name : matchup.away_player_name;
        const goalsScored = playerSide === 'home' ? matchup.home_goals : matchup.away_goals;
        const goalsConceded = playerSide === 'home' ? matchup.away_goals : matchup.home_goals;

        const won = goalsScored > goalsConceded;
        const draw = goalsScored === goalsConceded;
        const cleanSheet = goalsConceded === 0;
        const isMotm = fixture.motm_player_id === playerId;

        const oppCategory = playerSide === 'home' ? matchup.away_category : matchup.home_category;
        const result = won ? 'win' : draw ? 'draw' : 'loss';
        const resultPoints = getCategoryResultPts(oppCategory, result);

        let potdPts = 0;
        const potdAward = awards.find(
          (a: any) => a.award_type === 'POTD' && a.player_id === playerId && a.round_number === roundNum
        );
        if (potdAward) {
          potdPts = SCORING_RULES.player_of_the_day || SCORING_RULES.potd || SCORING_RULES.motm || 5;
        }

        let potwPts = 0;
        const weekNum = Math.ceil(roundNum / 7);
        const potwAward = awards.find(
          (a: any) => a.award_type === 'POTW' && a.player_id === playerId && a.week_number === weekNum
        );
        if (potwAward) {
          potwPts = SCORING_RULES.player_of_the_week || SCORING_RULES.potw || 10;
        }

        const points_breakdown: any = {
          opponent_player_id: playerSide === 'home' ? matchup.away_player_id : matchup.home_player_id,
          goals: (goalsScored || 0) * (SCORING_RULES.goals_scored || 2),
          conceded: (goalsConceded || 0) * (SCORING_RULES.goals_conceded || 0),
          result: resultPoints,
          motm: isMotm ? (SCORING_RULES.motm || 5) : 0,
          clean_sheet: cleanSheet ? (SCORING_RULES.clean_sheet || 6) : 0,
          match_played: SCORING_RULES.match_played || 1,
        };
        if (goalsScored === 2) points_breakdown.brace = SCORING_RULES.brace || 0;
        if (goalsScored >= 3) points_breakdown.hat_trick = SCORING_RULES.hat_trick || 5;
        if (goalsScored >= 6) points_breakdown.scored_6_plus = SCORING_RULES.scored_6_plus_goals || 8;
        if (goalsConceded >= 4) points_breakdown.concedes_4_plus = SCORING_RULES.concedes_4_plus_goals || -3;
        if (goalsConceded >= 15) points_breakdown.concedes_15_plus = SCORING_RULES.concedes_15_plus_goals || -5;
        if (potdPts > 0) points_breakdown.potd = potdPts;
        if (potwPts > 0) points_breakdown.potw = potwPts;

        const basePoints = Object.keys(points_breakdown)
          .filter(k => k !== 'opponent_player_id')
          .reduce((sum, key) => sum + (Number(points_breakdown[key]) || 0), 0);

        playerBasePointsMap.set(playerId, (playerBasePointsMap.get(playerId) || 0) + basePoints);

        for (const t of currentTeams as any[]) {
          const teamId = t.team_id;
          const squadSet = (roundNum <= 6) 
            ? (draftSquads.get(teamId) || new Set())
            : (postWindowSquads.get(teamId) || new Set());

          if (squadSet.has(playerId)) {
            let isCap = false;
            let isVc = false;

            const window = captainWindows.find((w: any) => roundNum >= w.start_round && roundNum <= w.end_round);
            if (window) {
              const sel = captainHistory.find((h: any) => h.team_id === teamId && h.window_id === window.window_id);
              if (sel) {
                isCap = sel.captain_player_id === playerId;
                isVc = sel.vice_captain_player_id === playerId;
              } else {
                const curSq = currentSquad.find((s: any) => s.team_id === teamId && s.real_player_id === playerId);
                if (curSq) {
                  isCap = curSq.is_captain;
                  isVc = curSq.is_vice_captain;
                }
              }
            } else {
              const curSq = currentSquad.find((s: any) => s.team_id === teamId && s.real_player_id === playerId);
              if (curSq) {
                isCap = curSq.is_captain;
                isVc = curSq.is_vice_captain;
              }
            }

            const multiplier = isCap ? 2 : isVc ? 1.5 : 1;
            const multiplierInt = isCap ? 200 : isVc ? 150 : 100;
            const totalPoints = Math.round(basePoints * multiplier);

            await fantasyDb`
              INSERT INTO fantasy_player_points (
                team_id, league_id, real_player_id, player_name,
                fixture_id, round_number, goals_scored, goals_conceded,
                is_clean_sheet, is_motm, result, total_points,
                is_captain, is_vice_captain, points_multiplier, base_points,
                points_breakdown, calculated_at
              ) VALUES (
                ${teamId}, ${LEAGUE_ID}, ${playerId}, ${playerName},
                ${matchup.fixture_id}, ${fixture.round_number}, ${goalsScored}, ${goalsConceded},
                ${cleanSheet}, ${isMotm}, ${result}, ${totalPoints},
                ${isCap}, ${isVc}, ${multiplierInt}, ${basePoints},
                ${JSON.stringify(points_breakdown)}, NOW()
              )
            `;
            results.playerPointsInserted++;
          }
        }
      }
    }

    // STEP 3: Calculate & Insert Passive Team Bonus Points
    console.log('🛡️ Recalculating passive team bonus points...');
    for (const fixture of fixtures as any[]) {
      if (fixture.home_score === null || fixture.away_score === null) continue;
      const roundNum = fixture.round_number;

      for (const side of ['home', 'away']) {
        const real_team_id = side === 'home' ? fixture.home_team_id : fixture.away_team_id;
        const goals_scored = side === 'home' ? fixture.home_score : fixture.away_score;
        const goals_conceded = side === 'home' ? fixture.away_score : fixture.home_score;

        for (const ft of currentTeams as any[]) {
          const activeSupportedTeamId = (roundNum <= 6)
            ? (draftSupportedTeams.get(ft.team_id) || null)
            : (ft.supported_team_id || null);

          if (!activeSupportedTeamId) continue;

          const isMatch = activeSupportedTeamId === real_team_id || activeSupportedTeamId.startsWith(`${real_team_id}_`);
          if (!isMatch) continue;

          const won = goals_scored > goals_conceded;
          const draw = goals_scored === goals_conceded;
          const lost = goals_scored < goals_conceded;
          const clean_sheet = goals_conceded === 0;

          const bonus_breakdown: any = {};
          let total_bonus = 0;
          TEAM_SCORING_RULES.forEach((points, ruleType) => {
            let applies = false;
            switch (ruleType) {
              case 'win': applies = won; break;
              case 'draw': applies = draw; break;
              case 'loss': applies = lost; break;
              case 'clean_sheet': applies = clean_sheet; break;
              case 'scored_4_plus_goals': applies = goals_scored >= 4; break;
              case 'scored_6_plus_goals': applies = goals_scored >= 6; break;
              case 'scored_8_plus_goals': applies = goals_scored >= 8; break;
              case 'concedes_4_plus_goals': applies = goals_conceded >= 4; break;
              case 'concedes_15_plus_goals': applies = goals_conceded >= 15; break;
            }
            if (applies) {
              bonus_breakdown[ruleType] = points;
              total_bonus += points;
            }
          });

          // Check TOD and TOW awards
          const todAward = awards.find(
            (a: any) => (a.award_type === 'TOD' || a.award_type === 'Team of the Day') && (a.team_id === real_team_id || activeSupportedTeamId.includes(a.team_id)) && a.round_number === roundNum
          );
          if (todAward) {
            const pts = TEAM_SCORING_RULES.get('team_of_the_day') || 5;
            bonus_breakdown['team_of_the_day'] = pts;
            total_bonus += pts;
          }

          const weekNum = Math.ceil(roundNum / 7);
          const towAward = awards.find(
            (a: any) => (a.award_type === 'TOW' || a.award_type === 'Team of the Week') && (a.team_id === real_team_id || activeSupportedTeamId.includes(a.team_id)) && (a.round_number === roundNum || a.week_number === weekNum)
          );
          if (towAward) {
            const pts = TEAM_SCORING_RULES.get('team_of_the_week') || 10;
            bonus_breakdown['team_of_the_week'] = pts;
            total_bonus += pts;
          }

          if (total_bonus > 0) {
            await fantasyDb`
              INSERT INTO fantasy_team_bonus_points (
                league_id, team_id, real_team_id, real_team_name,
                fixture_id, round_number, bonus_breakdown, total_bonus, calculated_at
              ) VALUES (
                ${LEAGUE_ID}, ${ft.team_id}, ${real_team_id},
                ${ft.supported_team_name || real_team_id}, ${fixture.fixture_id}, ${fixture.round_number},
                ${JSON.stringify(bonus_breakdown)}, ${total_bonus}, NOW()
              )
            `;
            results.passiveBonusesAwarded++;
          }
        }
      }
    }

    // STEP 4: Sync fantasy_players Cumulative Totals
    console.log('👤 Syncing fantasy_players base totals...');
    const allPlayers = await fantasyDb`SELECT real_player_id FROM fantasy_players WHERE league_id = ${LEAGUE_ID}`;
    for (const player of allPlayers as any[]) {
      const basePts = playerBasePointsMap.get(player.real_player_id) || 0;
      await fantasyDb`
        UPDATE fantasy_players
        SET total_points = ${basePts}, updated_at = NOW()
        WHERE league_id = ${LEAGUE_ID} AND real_player_id = ${player.real_player_id}
      `;
    }

    // STEP 5: Sync fantasy_squad Totals
    console.log('👥 Syncing fantasy_squad totals...');
    await fantasyDb`
      UPDATE fantasy_squad fs
      SET total_points = COALESCE((
        SELECT SUM(fpp.total_points)
        FROM fantasy_player_points fpp
        WHERE fpp.real_player_id = fs.real_player_id
          AND fpp.team_id = fs.team_id
          AND fpp.league_id = ${LEAGUE_ID}
      ), 0)
      WHERE fs.league_id = ${LEAGUE_ID}
    `;
    results.squadPlayersUpdated = currentSquad.length;

    // STEP 6: Sync fantasy_teams Totals and Leaderboard Ranks
    console.log('🏆 Syncing fantasy_teams totals and leaderboard ranks...');
    await fantasyDb`
      WITH player_totals AS (
        SELECT team_id, COALESCE(SUM(total_points), 0) as calc_player_points
        FROM fantasy_player_points
        WHERE league_id = ${LEAGUE_ID}
        GROUP BY team_id
      ),
      passive_totals AS (
        SELECT team_id, COALESCE(SUM(total_bonus), 0) as calc_passive_points
        FROM fantasy_team_bonus_points
        WHERE league_id = ${LEAGUE_ID}
        GROUP BY team_id
      )
      UPDATE fantasy_teams ft
      SET 
        player_points = COALESCE(pt.calc_player_points, 0),
        passive_points = COALESCE(pas.calc_passive_points, 0),
        total_points = COALESCE(pt.calc_player_points, 0) + COALESCE(pas.calc_passive_points, 0),
        updated_at = NOW()
      FROM fantasy_teams ft_inner
      LEFT JOIN player_totals pt ON ft_inner.team_id = pt.team_id
      LEFT JOIN passive_totals pas ON ft_inner.team_id = pas.team_id
      WHERE ft.team_id = ft_inner.team_id
        AND ft.league_id = ${LEAGUE_ID}
    `;
    results.teamsUpdated = currentTeams.length;

    // Recalculate Ranks
    await fantasyDb`
      WITH ranked_teams AS (
        SELECT 
          team_id,
          ROW_NUMBER() OVER (ORDER BY total_points DESC, team_name ASC) as new_rank
        FROM fantasy_teams
        WHERE league_id = ${LEAGUE_ID}
      )
      UPDATE fantasy_teams ft
      SET rank = rt.new_rank, updated_at = NOW()
      FROM ranked_teams rt
      WHERE ft.team_id = rt.team_id
        AND ft.league_id = ${LEAGUE_ID}
    `;
    results.leaguesRanked = currentTeams.length;

    return NextResponse.json({
      success: true,
      message: 'Season 18 window-aware fantasy points recalculation completed successfully',
      results,
    });

  } catch (error: any) {
    console.error('Error recalculating fantasy points:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to recalculate fantasy points',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

