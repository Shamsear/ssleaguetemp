import fs from 'fs';
import path from 'path';

try {
  const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  });
} catch (e) {
  console.log('No .env.local parsed');
}

import { getFantasyDb } from './neon/fantasy-config';
import { getTournamentDb } from './neon/tournament-config';

async function recalculateAndAudit() {
  const fantasyDb = getFantasyDb();
  const tournamentDb = getTournamentDb();

  const LEAGUE_ID = 'SSPSLFLS18';
  const SEASON_ID = 'SSPSLS18';

  console.log('========================================================================');
  console.log('       FANTASY LEAGUE COMPLETE RECALCULATION & AUDIT (ROUNDS 1-19)       ');
  console.log('========================================================================\n');

  // 1. Scoring rules
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

  console.log('📋 Player Scoring Rules:', SCORING_RULES);
  console.log('📋 Team Scoring Rules:', Object.fromEntries(TEAM_SCORING_RULES.entries()));

  // 2. Fixtures and Matchups
  const fixtures = await tournamentDb`
    SELECT id as fixture_id, season_id, round_number, home_team_id, away_team_id, home_score, away_score, motm_player_id
    FROM fixtures
    WHERE status = 'completed' AND season_id = ${SEASON_ID}
    ORDER BY round_number ASC
  `;
  const fixtureMap = new Map();
  fixtures.forEach((f: any) => fixtureMap.set(f.fixture_id, f));

  const completedRounds = Array.from(new Set(fixtures.map((f: any) => Number(f.round_number)))).sort((a, b) => a - b);
  console.log(`\n📅 Completed Rounds in Tournament DB (${completedRounds.length}):`, completedRounds.join(', '));

  const matchups = await tournamentDb`
    SELECT 
      m.fixture_id,
      f.round_number,
      m.home_player_id, m.home_player_name,
      m.away_player_id, m.away_player_name,
      m.home_goals, m.away_goals,
      COALESCE(rps_home.category, 'Red') as home_category,
      COALESCE(rps_away.category, 'Red') as away_category
    FROM matchups m
    JOIN fixtures f ON m.fixture_id = f.id
    LEFT JOIN realplayerstats rps_home ON (m.home_player_id = rps_home.player_id AND f.season_id = rps_home.season_id)
    LEFT JOIN realplayerstats rps_away ON (m.away_player_id = rps_away.player_id AND f.season_id = rps_away.season_id)
    WHERE f.season_id = ${SEASON_ID}
      AND (m.is_null IS NOT TRUE)
      AND m.home_goals IS NOT NULL 
      AND m.away_goals IS NOT NULL
  `;
  console.log(`⚽ Loaded ${matchups.length} valid individual matchups`);

  // 3. Teams and Squads
  const currentTeams = await fantasyDb`
    SELECT team_id, team_name, owner_name, supported_team_id, supported_team_name, budget_remaining
    FROM fantasy_teams
    WHERE league_id = ${LEAGUE_ID}
    ORDER BY team_name ASC
  `;

  const currentSquad = await fantasyDb`
    SELECT team_id, real_player_id, player_name, is_captain, is_vice_captain, acquisition_type 
    FROM fantasy_squad 
    WHERE league_id = ${LEAGUE_ID}
  `;

  const releasesAll = await fantasyDb`
    SELECT fr.team_id, fr.real_player_id, fr.player_name, fr.is_passive_team, fr.window_id,
           COALESCE(ftw.start_round, 999) as release_start_round
    FROM fantasy_releases fr
    LEFT JOIN fantasy_transfer_windows ftw ON fr.window_id = ftw.window_id
    WHERE fr.league_id = ${LEAGUE_ID} AND fr.is_passive_team = false
  `;

  const postBidsAll = await fantasyDb`
    SELECT fprb.team_id, fprb.target_id, fprb.target_name,
           COALESCE(ftw.start_round, 999) as acq_start_round
    FROM fantasy_post_release_bids fprb
    LEFT JOIN fantasy_transfer_windows ftw ON fprb.draft_round_id = ftw.window_id
    WHERE fprb.league_id = ${LEAGUE_ID} AND fprb.status = 'won' AND fprb.is_passive_team = false
  `;

  const swapsAll = await fantasyDb`
    SELECT fs.team_id, fs.player_out_id, fs.player_in_id,
           COALESCE(ftw.start_round, 999) as swap_start_round
    FROM fantasy_swaps fs
    LEFT JOIN fantasy_transfer_windows ftw ON fs.window_id = ftw.window_id
    WHERE fs.league_id = ${LEAGUE_ID}
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

  const awards = await tournamentDb`
    SELECT award_type, round_number, week_number, player_id, team_id
    FROM awards
    WHERE season_id = ${SEASON_ID}
  `;
  console.log(`🏆 Loaded ${awards.length} awards from Tournament DB`);

  // Supported Teams Timeline Resolver
  // Initial Draft Slot 6
  const initialSlot6 = await fantasyDb`
    SELECT team_id, target_id 
    FROM fantasy_draft_bids 
    WHERE league_id = ${LEAGUE_ID} AND slot_index = 6 AND status = 'won'
  `;
  const initialSupportedTeamMap = new Map<string, string>();
  initialSlot6.forEach((b: any) => initialSupportedTeamMap.set(b.team_id, b.target_id));

  // Passive releases & post bids
  const passiveReleases = await fantasyDb`
    SELECT r.team_id, r.real_player_id, COALESCE(tw.start_round, 999) as release_start_round
    FROM fantasy_releases r
    LEFT JOIN fantasy_transfer_windows tw ON r.window_id = tw.window_id
    WHERE r.league_id = ${LEAGUE_ID} AND r.is_passive_team = true
    ORDER BY release_start_round ASC
  `;

  const passiveWonBids = await fantasyDb`
    SELECT b.team_id, b.target_id, COALESCE(tw.start_round, 999) as acq_start_round
    FROM fantasy_post_release_bids b
    LEFT JOIN fantasy_transfer_windows tw ON b.draft_round_id = tw.window_id
    WHERE b.league_id = ${LEAGUE_ID} AND b.is_passive_team = true AND b.status = 'won'
    ORDER BY acq_start_round ASC
  `;

  const getSupportedTeamForRound = (teamId: string, roundNum: number): string | null => {
    // If round <= 6: Initial Draft Slot 6
    if (roundNum <= 6) {
      return initialSupportedTeamMap.get(teamId) || null;
    }
    // For round > 6: Check post-release bids active at roundNum
    // If round 7-17: check won bids in window with start_round <= roundNum
    // We can evaluate chronologically:
    let currentSuppTeam = initialSupportedTeamMap.get(teamId) || null;

    // Check Window 1 (starts R7)
    const w1Bid = passiveWonBids.find((b: any) => b.team_id === teamId && b.acq_start_round <= roundNum && b.acq_start_round === 7);
    if (w1Bid && roundNum >= 7) {
      currentSuppTeam = w1Bid.target_id;
    }

    // Check Window 2 (starts R12)
    const w2Bid = passiveWonBids.find((b: any) => b.team_id === teamId && b.acq_start_round <= roundNum && b.acq_start_round === 12);
    if (w2Bid && roundNum >= 12) {
      currentSuppTeam = w2Bid.target_id;
    }

    // Check Window 3 (starts R18)
    const w3Bid = passiveWonBids.find((b: any) => b.team_id === teamId && b.acq_start_round <= roundNum && b.acq_start_round === 18);
    if (w3Bid && roundNum >= 18) {
      currentSuppTeam = w3Bid.target_id;
    }

    return currentSuppTeam;
  };

  // Squad Set Resolver for Round
  const roundSquadCache = new Map<string, Set<string>>();
  const getSquadSetForRound = (teamId: string, roundNum: number): Set<string> => {
    const cacheKey = `${teamId}_${roundNum}`;
    if (roundSquadCache.has(cacheKey)) return roundSquadCache.get(cacheKey)!;

    const players = new Set<string>();
    currentSquad.filter((s: any) => s.team_id === teamId).forEach((s: any) => {
      players.add(s.real_player_id);
    });

    // If player was released AFTER roundNum, add them back
    releasesAll.filter((r: any) => r.team_id === teamId && Number(r.release_start_round) > roundNum).forEach((r: any) => {
      players.add(r.real_player_id);
    });

    // If player was acquired AFTER roundNum, remove them
    postBidsAll.filter((p: any) => p.team_id === teamId && Number(p.acq_start_round) > roundNum).forEach((p: any) => {
      players.delete(p.target_id);
    });

    // If swap occurred AFTER roundNum, undo swap
    swapsAll.filter((s: any) => s.team_id === teamId && Number(s.swap_start_round) > roundNum).forEach((s: any) => {
      if (s.player_in_id) players.delete(s.player_in_id);
      if (s.player_out_id) players.add(s.player_out_id);
    });

    roundSquadCache.set(cacheKey, players);
    return players;
  };

  const getCategoryResultPts = (oppCat: string, outcome: string): number => {
    const cat = (oppCat || '').toLowerCase();
    if (cat.includes('red') || cat === 'r')   return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3);
    if (cat.includes('black'))                 return outcome === 'win' ? 7 : (outcome === 'draw' ? 3 : -4);
    if (cat.includes('blue') || cat === 'b')  return outcome === 'win' ? 6 : (outcome === 'draw' ? 2 : -5);
    if (cat.includes('white') || cat === 'w') return outcome === 'win' ? 5 : (outcome === 'draw' ? 1 : -6);
    return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3);
  };

  // Perform Recalculation in Memory
  const teamRoundPlayerPoints: Record<string, Record<number, number>> = {};
  const teamRoundPassivePoints: Record<string, Record<number, number>> = {};
  const teamTotalPlayerPoints: Record<string, number> = {};
  const teamTotalPassivePoints: Record<string, number> = {};

  currentTeams.forEach((t: any) => {
    teamRoundPlayerPoints[t.team_id] = {};
    teamRoundPassivePoints[t.team_id] = {};
    teamTotalPlayerPoints[t.team_id] = 0;
    teamTotalPassivePoints[t.team_id] = 0;
    completedRounds.forEach(r => {
      teamRoundPlayerPoints[t.team_id][r] = 0;
      teamRoundPassivePoints[t.team_id][r] = 0;
    });
  });

  // Calculate Player Points
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

      const basePoints = Object.values(points_breakdown).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);

      for (const t of currentTeams as any[]) {
        const teamId = t.team_id;
        const squadSet = getSquadSetForRound(teamId, roundNum);

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
          const totalPoints = Math.round(basePoints * multiplier);

          teamRoundPlayerPoints[teamId][roundNum] = (teamRoundPlayerPoints[teamId][roundNum] || 0) + totalPoints;
          teamTotalPlayerPoints[teamId] = (teamTotalPlayerPoints[teamId] || 0) + totalPoints;
        }
      }
    }
  }

  // Calculate Passive Supported Team Bonus Points
  for (const fixture of fixtures as any[]) {
    if (fixture.home_score === null || fixture.away_score === null) continue;
    const roundNum = fixture.round_number;

    for (const side of ['home', 'away']) {
      const real_team_id = side === 'home' ? fixture.home_team_id : fixture.away_team_id;
      const goals_scored = side === 'home' ? fixture.home_score : fixture.away_score;
      const goals_conceded = side === 'home' ? fixture.away_score : fixture.home_score;

      for (const ft of currentTeams as any[]) {
        const activeSupportedTeamId = getSupportedTeamForRound(ft.team_id, roundNum);
        if (!activeSupportedTeamId) continue;

        const isMatch = activeSupportedTeamId === real_team_id || 
                        activeSupportedTeamId.startsWith(`${real_team_id}_`) ||
                        real_team_id.startsWith(`${activeSupportedTeamId}_`) ||
                        activeSupportedTeamId.replace(/_SSPSLS18$/, '') === real_team_id.replace(/_SSPSLS18$/, '');

        if (!isMatch) continue;

        const won = goals_scored > goals_conceded;
        const draw = goals_scored === goals_conceded;
        const lost = goals_scored < goals_conceded;
        const clean_sheet = goals_conceded === 0;

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
            total_bonus += points;
          }
        });

        // TOD / TOW awards
        const todAward = awards.find(
          (a: any) => (a.award_type === 'TOD' || a.award_type === 'Team of the Day') &&
                      (a.team_id === real_team_id || activeSupportedTeamId.includes(a.team_id) || a.team_id.replace(/_SSPSLS18$/, '') === real_team_id.replace(/_SSPSLS18$/, '')) &&
                      a.round_number === roundNum
        );
        if (todAward) {
          const pts = TEAM_SCORING_RULES.get('team_of_the_day') || 5;
          total_bonus += pts;
        }

        const weekNum = Math.ceil(roundNum / 7);
        const towAward = awards.find(
          (a: any) => (a.award_type === 'TOW' || a.award_type === 'Team of the Week') &&
                      (a.team_id === real_team_id || activeSupportedTeamId.includes(a.team_id) || a.team_id.replace(/_SSPSLS18$/, '') === real_team_id.replace(/_SSPSLS18$/, '')) &&
                      (a.round_number === roundNum || a.week_number === weekNum)
        );
        if (towAward) {
          const pts = TEAM_SCORING_RULES.get('team_of_the_week') || 10;
          total_bonus += pts;
        }

        if (total_bonus > 0) {
          teamRoundPassivePoints[ft.team_id][roundNum] = (teamRoundPassivePoints[ft.team_id][roundNum] || 0) + total_bonus;
          teamTotalPassivePoints[ft.team_id] = (teamTotalPassivePoints[ft.team_id] || 0) + total_bonus;
        }
      }
    }
  }

  // Print Leaderboard Summary
  const standings = currentTeams.map((t: any) => {
    const pPts = teamTotalPlayerPoints[t.team_id] || 0;
    const pasPts = teamTotalPassivePoints[t.team_id] || 0;
    return {
      team_id: t.team_id,
      team_name: t.team_name,
      owner_name: t.owner_name,
      player_points: pPts,
      passive_points: pasPts,
      total_points: pPts + pasPts,
      budget: Number(t.budget_remaining)
    };
  }).sort((a, b) => b.total_points - a.total_points || b.player_points - a.player_points);

  console.log('\n========================================================================');
  console.log('              RECALCULATED OVERALL LEADERBOARD (ROUNDS 1-19)            ');
  console.log('========================================================================');
  console.table(standings.map((s, idx) => ({
    Rank: idx + 1,
    'Team Name': s.team_name,
    'Player Pts': s.player_points,
    'Passive Pts': s.passive_points,
    'Total Points': s.total_points,
    Budget: `₹${s.budget} Cr`
  })));

  // Compare with current database standings in fantasy_teams table
  console.log('\n========================================================================');
  console.log('       COMPARISON: RECALCULATED STANDINGS vs CURRENT DB fantasy_teams    ');
  console.log('========================================================================');
  const dbFantasyTeams = await fantasyDb`
    SELECT team_id, team_name, player_points, passive_points, total_points, rank
    FROM fantasy_teams
    WHERE league_id = ${LEAGUE_ID}
    ORDER BY total_points DESC
  `;

  console.table(dbFantasyTeams.map((d: any) => {
    const recalc = standings.find(s => s.team_id === d.team_id);
    const diff = (recalc?.total_points || 0) - Number(d.total_points);
    return {
      Team: d.team_name,
      'DB Total': Number(d.total_points),
      'Recalc Total': recalc?.total_points || 0,
      'Diff (Recalc - DB)': diff > 0 ? `+${diff}` : `${diff}`,
      'DB Player': Number(d.player_points),
      'Recalc Player': recalc?.player_points || 0,
      'DB Passive': Number(d.passive_points),
      'Recalc Passive': recalc?.passive_points || 0
    };
  }));

  // Output round-by-round matrix
  console.log('\n========================================================================');
  console.log('                   ROUND-BY-ROUND POINTS MATRIX (R1 - R19)              ');
  console.log('========================================================================');
  completedRounds.forEach(r => {
    console.log(`\n--- ROUND ${r} ---`);
    const rRows = currentTeams.map((t: any) => {
      const p = teamRoundPlayerPoints[t.team_id][r] || 0;
      const pas = teamRoundPassivePoints[t.team_id][r] || 0;
      const supp = getSupportedTeamForRound(t.team_id, r);
      return {
        Team: t.team_name,
        'Supported Team': supp ? supp.replace('_SSPSLS18', '') : 'None',
        'Player Pts': p,
        'Passive Pts': pas,
        'Round Total': p + pas
      };
    }).sort((a, b) => b['Round Total'] - a['Round Total']);
    console.table(rRows);
  });
}

recalculateAndAudit().catch(console.error);
