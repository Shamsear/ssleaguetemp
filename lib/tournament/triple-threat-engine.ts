/**
 * SS TRIPLE THREAT - Calculation & Rules Engine
 * 
 * Rules:
 * 1. Three Modes per matchday (4 matches total):
 *    - Co-op Match (2v2) — 1 match
 *    - Duo Mode (2 x 1v1 Goal based) — 2 individual 1v1 matches combined on aggregate goals
 *    - Single Match (1v1) — 1 match
 * 2. Exactly 5 unique players fielded per team per matchday:
 *    - Co-op: 2 players
 *    - Duo: 2 players (Duo P1 vs Away P1, Duo P2 vs Away P2)
 *    - Single: 1 player
 *    - All 5 players must be unique (no overlap across modes)
 * 3. Mode Points:
 *    - Win: 3 Points
 *    - Draw: 1 Point
 *    - Loss: 0 Points
 * 4. Clean Sweep Bonus:
 *    - If a team wins ALL THREE modes, they get +1 bonus point.
 *    - Max achievable points per fixture: 10 Points.
 * 5. Points-based GD (Goal Difference):
 *    - GD is calculated as Points Difference (Points For vs Points Against)
 *    - Example: Sweep = 10 pts vs 0 pts -> Final GD: +10 / -10
 */

import { extractISTDateString } from '@/lib/utils/timezone';

export type TripleThreatMode = 'coop' | 'duo' | 'single';

export interface TripleThreatMatchInput {
  position?: number;
  mode: TripleThreatMode;
  home_goals: number | null | undefined;
  away_goals: number | null | undefined;
  home_player_ids?: string[];
  home_player_names?: string[];
  away_player_ids?: string[];
  away_player_names?: string[];
}

export interface TripleThreatMatchResult {
  position?: number;
  mode: TripleThreatMode;
  home_goals: number;
  away_goals: number;
  home_points: number; // 3, 1, or 0 (awarded once per mode — 0 on secondary Duo leg)
  away_points: number; // 3, 1, or 0 (awarded once per mode — 0 on secondary Duo leg)
  home_bonus?: number; // 1 if clean sweep, else 0
  away_bonus?: number; // 1 if clean sweep, else 0
  outcome: 'home_win' | 'away_win' | 'draw';
}

export interface TripleThreatModeSummary {
  mode: TripleThreatMode;
  played: boolean;
  home_goals: number;
  away_goals: number;
  home_points: number;
  away_points: number;
  outcome: 'home_win' | 'away_win' | 'draw' | 'pending';
}

export interface TripleThreatFixtureResult {
  matches: TripleThreatMatchResult[];
  matchResults: TripleThreatMatchResult[]; // Alias for backward compatibility
  modeResults: Record<TripleThreatMode, TripleThreatModeSummary>;
  home_matches_won: number;
  away_matches_won: number;
  draws: number;
  home_base_points: number;
  away_base_points: number;
  home_clean_sweep_bonus: number; // 1 if won all 3 modes, else 0
  away_clean_sweep_bonus: number; // 1 if won all 3 modes, else 0
  home_total_points: number; // base + bonus (0 - 10)
  away_total_points: number; // base + bonus (0 - 10)
  home_points_difference: number; // home_total_points - away_total_points
  away_points_difference: number; // away_total_points - home_total_points
  fixture_winner: 'home' | 'away' | 'draw';
  is_clean_sweep: boolean;
  clean_sweep_team: 'home' | 'away' | null;
  clean_sweep_winner: 'home' | 'away' | null;
}

export interface TripleThreatLineupSubmission {
  coop: (string | { player_id?: string; id?: string; player_name?: string; name?: string })[];
  duo: (string | { player_id?: string; id?: string; player_name?: string; name?: string })[];
  single: (string | { player_id?: string; id?: string; player_name?: string; name?: string })[];
}

function extractPlayerId(item: any): string {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  return String(item.player_id || item.id || '').trim();
}

/**
 * Validates a team's lineup for SS Triple Threat
 * Enforces 2 Co-op, 2 Duo, 1 Single, and strict player uniqueness.
 */
export function validateTripleThreatLineup(
  lineup: TripleThreatLineupSubmission,
  playerNamesMap?: Record<string, string>
): { valid: boolean; error?: string } {
  if (!lineup) {
    return { valid: false, error: 'Lineup data is required' };
  }

  const coopIds = (lineup.coop || []).map(extractPlayerId).filter(Boolean);
  const duoIds = (lineup.duo || []).map(extractPlayerId).filter(Boolean);
  const singleIds = (lineup.single || []).map(extractPlayerId).filter(Boolean);

  if (coopIds.length !== 2) {
    return { valid: false, error: `Co-op mode requires exactly 2 players (selected ${coopIds.length})` };
  }

  if (duoIds.length !== 2) {
    return { valid: false, error: `Duo mode requires exactly 2 players (selected ${duoIds.length})` };
  }

  if (singleIds.length !== 1) {
    return { valid: false, error: `Single (1v1) mode requires exactly 1 player (selected ${singleIds.length})` };
  }

  const allPlayers = [...coopIds, ...duoIds, ...singleIds];
  const uniquePlayers = new Set(allPlayers);

  if (uniquePlayers.size !== 5) {
    // Find duplicate players
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const pid of allPlayers) {
      if (seen.has(pid)) {
        const name = playerNamesMap?.[pid] || pid;
        duplicates.push(name);
      } else {
        seen.add(pid);
      }
    }
    const duplicateNames = [...new Set(duplicates)].join(', ');
    return {
      valid: false,
      error: `Each player can only participate in one mode per matchday. Duplicate player(s) found: ${duplicateNames}`
    };
  }

  return { valid: true };
}

/**
 * Resolves the TripleThreatMode of a matchup record cleanly whether legacy 3-match (coop, duo 2v2, single)
 * or current 4-match format (coop 2v2, duo 1v1 #1, duo 1v1 #2, single 1v1).
 */
export function resolveTripleThreatMode(match: {
  match_mode?: string | null;
  mode?: string | null;
  position?: number;
  home_player_ids?: any[];
}): TripleThreatMode {
  const explicit = (match.match_mode || match.mode || '').toLowerCase().trim();
  if (explicit === 'coop' || explicit === 'duo' || explicit === 'single') {
    return explicit;
  }
  if (match.position === 1) return 'coop';
  if (match.position === 2) return 'duo';
  if (match.position === 4) return 'single';
  return 'single';
}

export interface TripleThreatModeDisplay {
  mode: TripleThreatMode;
  title: string;
  longTitle: string;
  icon: string;
  badgeClass: string;
  isSubMatch: boolean;
}

/**
 * Shared badge/label metadata for any Triple Threat matchup row (supports both 2-leg 1v1 Duo and legacy 2v2 Duo).
 */
export function getTripleThreatModeDisplay(
  allMatchups: Array<{ match_mode?: string | null; mode?: string | null; position?: number; home_player_ids?: any[] }>,
  targetMatchup: { match_mode?: string | null; mode?: string | null; position?: number; home_player_ids?: any[] }
): TripleThreatModeDisplay {
  const mode = resolveTripleThreatMode(targetMatchup);
  if (mode === 'coop') {
    return {
      mode,
      title: 'CO-OP (2v2)',
      longTitle: 'CO-OP MATCH (2v2)',
      icon: '🎮',
      badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      isSubMatch: false,
    };
  }
  if (mode === 'duo') {
    const duoMatchups = (allMatchups || []).filter((m) => resolveTripleThreatMode(m) === 'duo');
    const isTwoLeg = duoMatchups.length > 1;
    const legIndex = duoMatchups.findIndex((m) => m === targetMatchup || (targetMatchup.position !== undefined && m.position === targetMatchup.position));
    const legNum = legIndex >= 0 ? legIndex + 1 : 1;
    return {
      mode,
      title: isTwoLeg ? `DUO 1v1 #${legNum}` : 'DUO (2v2)',
      longTitle: isTwoLeg ? `DUO 1v1 #${legNum} (GOAL AGG)` : 'DUO MATCH (2v2)',
      icon: '🤝',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      isSubMatch: isTwoLeg,
    };
  }
  return {
    mode: 'single',
    title: 'SINGLE (1v1)',
    longTitle: 'SINGLE MATCH (1v1)',
    icon: '⚔️',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    isSubMatch: false,
  };
}

export interface BuiltTripleThreatMatchup {
  position: number;
  match_mode: TripleThreatMode;
  home_player_id: string;
  home_player_name: string;
  away_player_id: string;
  away_player_name: string;
  home_player_ids: string[];
  home_player_names: string[];
  away_player_ids: string[];
  away_player_names: string[];
  match_duration: number;
}

/**
 * Builds the 4 Triple Threat matchup rows from both submitted lineups:
 * - Pos 1: Co-op (2v2)
 * - Pos 2: Duo 1v1 #1 (Home Duo P1 vs Away Duo P1)
 * - Pos 3: Duo 1v1 #2 (Home Duo P2 vs Away Duo P2)
 * - Pos 4: Single (1v1)
 */
export function buildTripleThreatMatchups(
  homeTT: TripleThreatLineupSubmission,
  awayTT: TripleThreatLineupSubmission,
  getNames: (ids: string[]) => string[]
): BuiltTripleThreatMatchup[] {
  const homeCoopIds = (homeTT.coop || []).map(extractPlayerId).filter(Boolean);
  const homeDuoIds = (homeTT.duo || []).map(extractPlayerId).filter(Boolean);
  const homeSingleIds = (homeTT.single || []).map(extractPlayerId).filter(Boolean);

  const awayCoopIds = (awayTT.coop || []).map(extractPlayerId).filter(Boolean);
  const awayDuoIds = (awayTT.duo || []).map(extractPlayerId).filter(Boolean);
  const awaySingleIds = (awayTT.single || []).map(extractPlayerId).filter(Boolean);

  const homeCoopNames = getNames(homeCoopIds);
  const homeDuoNames = getNames(homeDuoIds);
  const homeSingleNames = getNames(homeSingleIds);

  const awayCoopNames = getNames(awayCoopIds);
  const awayDuoNames = getNames(awayDuoIds);
  const awaySingleNames = getNames(awaySingleIds);

  return [
    {
      position: 1,
      match_mode: 'coop',
      home_player_id: homeCoopIds[0] || '',
      home_player_name: homeCoopNames.join(' & ') || '',
      away_player_id: awayCoopIds[0] || '',
      away_player_name: awayCoopNames.join(' & ') || '',
      home_player_ids: homeCoopIds,
      home_player_names: homeCoopNames,
      away_player_ids: awayCoopIds,
      away_player_names: awayCoopNames,
      match_duration: 8,
    },
    {
      position: 2,
      match_mode: 'duo',
      home_player_id: homeDuoIds[0] || '',
      home_player_name: homeDuoNames[0] || '',
      away_player_id: awayDuoIds[0] || '',
      away_player_name: awayDuoNames[0] || '',
      home_player_ids: homeDuoIds[0] ? [homeDuoIds[0]] : [],
      home_player_names: homeDuoNames[0] ? [homeDuoNames[0]] : [],
      away_player_ids: awayDuoIds[0] ? [awayDuoIds[0]] : [],
      away_player_names: awayDuoNames[0] ? [awayDuoNames[0]] : [],
      match_duration: 6,
    },
    {
      position: 3,
      match_mode: 'duo',
      home_player_id: homeDuoIds[1] || '',
      home_player_name: homeDuoNames[1] || '',
      away_player_id: awayDuoIds[1] || '',
      away_player_name: awayDuoNames[1] || '',
      home_player_ids: homeDuoIds[1] ? [homeDuoIds[1]] : [],
      home_player_names: homeDuoNames[1] ? [homeDuoNames[1]] : [],
      away_player_ids: awayDuoIds[1] ? [awayDuoIds[1]] : [],
      away_player_names: awayDuoNames[1] ? [awayDuoNames[1]] : [],
      match_duration: 6,
    },
    {
      position: 4,
      match_mode: 'single',
      home_player_id: homeSingleIds[0] || '',
      home_player_name: homeSingleNames[0] || '',
      away_player_id: awaySingleIds[0] || '',
      away_player_name: awaySingleNames[0] || '',
      home_player_ids: homeSingleIds,
      home_player_names: homeSingleNames,
      away_player_ids: awaySingleIds,
      away_player_names: awaySingleNames,
      match_duration: 6,
    },
  ];
}

/**
 * Calculates matchday points, bonuses, and points-based GD for a Triple Threat fixture.
 * Aggregates goals per mode so Duo (2 × 1v1) awards 3/1/0 points to whichever team scores more total Duo goals.
 */
export function calculateTripleThreatFixture(
  matches: TripleThreatMatchInput[]
): TripleThreatFixtureResult {
  const modeBuckets: Record<TripleThreatMode, TripleThreatMatchInput[]> = {
    coop: [],
    duo: [],
    single: [],
  };

  matches.forEach((m, idx) => {
    const resolvedMode = resolveTripleThreatMode({
      mode: m.mode,
      position: m.position ?? idx + 1,
      home_player_ids: m.home_player_ids,
    });
    modeBuckets[resolvedMode].push({ ...m, mode: resolvedMode, position: m.position ?? idx + 1 });
  });

  let homeMatchesWon = 0;
  let awayMatchesWon = 0;
  let draws = 0;
  let homeBasePoints = 0;
  let awayBasePoints = 0;

  const isScored = (m: TripleThreatMatchInput) =>
    m.home_goals !== null &&
    m.home_goals !== undefined &&
    m.away_goals !== null &&
    m.away_goals !== undefined &&
    String(m.home_goals) !== '' &&
    String(m.away_goals) !== '';

  const modeResults = {} as Record<TripleThreatMode, TripleThreatModeSummary>;
  const modes: TripleThreatMode[] = ['coop', 'duo', 'single'];

  for (const mode of modes) {
    const bucket = modeBuckets[mode];
    const allPlayed = bucket.length > 0 && bucket.every(isScored);
    const homeGoals = bucket.reduce((sum, m) => sum + (isScored(m) ? Number(m.home_goals) : 0), 0);
    const awayGoals = bucket.reduce((sum, m) => sum + (isScored(m) ? Number(m.away_goals) : 0), 0);

    let hp = 0;
    let ap = 0;
    let outcome: 'home_win' | 'away_win' | 'draw' | 'pending' = 'pending';

    if (allPlayed) {
      if (homeGoals > awayGoals) {
        hp = 3;
        ap = 0;
        outcome = 'home_win';
        homeMatchesWon++;
      } else if (awayGoals > homeGoals) {
        hp = 0;
        ap = 3;
        outcome = 'away_win';
        awayMatchesWon++;
      } else {
        hp = 1;
        ap = 1;
        outcome = 'draw';
        draws++;
      }
      homeBasePoints += hp;
      awayBasePoints += ap;
    }

    modeResults[mode] = {
      mode,
      played: allPlayed,
      home_goals: homeGoals,
      away_goals: awayGoals,
      home_points: hp,
      away_points: ap,
      outcome,
    };
  }

  // Check Clean Sweep Bonus (+1 point if won all 3 modes)
  const isHomeCleanSweep = homeMatchesWon === 3;
  const isAwayCleanSweep = awayMatchesWon === 3;

  const homeBonus = isHomeCleanSweep ? 1 : 0;
  const awayBonus = isAwayCleanSweep ? 1 : 0;

  // Map per-matchup results cleanly (Duo mode awards its 3/1/0 points once on its primary row to prevent SUM double-counting)
  const modeAwardedOnce = new Set<TripleThreatMode>();
  const processedMatches: TripleThreatMatchResult[] = matches.map((match, idx) => {
    const mode = resolveTripleThreatMode({
      mode: match.mode,
      position: match.position ?? idx + 1,
      home_player_ids: match.home_player_ids,
    });
    const hg = Number(match.home_goals ?? 0);
    const ag = Number(match.away_goals ?? 0);
    const outcome: 'home_win' | 'away_win' | 'draw' =
      hg > ag ? 'home_win' : ag > hg ? 'away_win' : 'draw';

    const isPrimaryForMode = !modeAwardedOnce.has(mode);
    modeAwardedOnce.add(mode);

    const summary = modeResults[mode];
    return {
      position: match.position || idx + 1,
      mode,
      home_goals: hg,
      away_goals: ag,
      home_points: isPrimaryForMode ? summary.home_points : 0,
      away_points: isPrimaryForMode ? summary.away_points : 0,
      home_bonus: homeBonus,
      away_bonus: awayBonus,
      outcome,
    };
  });

  const homeTotalPoints = homeBasePoints + homeBonus;
  const awayTotalPoints = awayBasePoints + awayBonus;

  // Points-based Goal Difference (GD = Points For - Points Against)
  const homePointsDiff = homeTotalPoints - awayTotalPoints;
  const awayPointsDiff = awayTotalPoints - homeTotalPoints;

  let fixtureWinner: 'home' | 'away' | 'draw' = 'draw';
  if (homeTotalPoints > awayTotalPoints) {
    fixtureWinner = 'home';
  } else if (awayTotalPoints > homeTotalPoints) {
    fixtureWinner = 'away';
  }

  const cleanSweepTeam = isHomeCleanSweep ? 'home' : isAwayCleanSweep ? 'away' : null;

  return {
    matches: processedMatches,
    matchResults: processedMatches,
    modeResults,
    home_matches_won: homeMatchesWon,
    away_matches_won: awayMatchesWon,
    draws,
    home_base_points: homeBasePoints,
    away_base_points: awayBasePoints,
    home_clean_sweep_bonus: homeBonus,
    away_clean_sweep_bonus: awayBonus,
    home_total_points: homeTotalPoints,
    away_total_points: awayTotalPoints,
    home_points_difference: homePointsDiff,
    away_points_difference: awayPointsDiff,
    fixture_winner: fixtureWinner,
    is_clean_sweep: isHomeCleanSweep || isAwayCleanSweep,
    clean_sweep_team: cleanSweepTeam,
    clean_sweep_winner: cleanSweepTeam,
  };
}

export interface SidePlayerGoalStat {
  id: string;
  name: string;
  goalsScored: number;
}

/**
 * Extracts each player participating on `side` ('home' | 'away') along with their individual goals scored.
 * In Co-op (2v2), uses `home_player_goals` / `away_player_goals` when present; otherwise uses team `home_goals` / `away_goals`.
 */
export function resolveSideGoalBreakdown(
  matchup: any,
  side: 'home' | 'away'
): { players: SidePlayerGoalStat[]; teamGoalsScored: number; teamGoalsConceded: number } {
  const isHome = side === 'home';
  const rawIds = isHome ? matchup.home_player_ids : matchup.away_player_ids;
  const rawNames = isHome ? matchup.home_player_names : matchup.away_player_names;
  const scalarId = isHome ? matchup.home_player_id : matchup.away_player_id;
  const scalarName = isHome ? matchup.home_player_name : matchup.away_player_name;
  const rawPlayerGoals = isHome ? matchup.home_player_goals : matchup.away_player_goals;
  const teamGoalsScored = Number(isHome ? matchup.home_goals : matchup.away_goals) || 0;
  const teamGoalsConceded = Number(isHome ? matchup.away_goals : matchup.home_goals) || 0;

  const entries: Array<{ id: string; name: string }> = [];
  if (Array.isArray(rawIds) && rawIds.length > 0) {
    rawIds.forEach((id: any, idx: number) => {
      if (id) {
        entries.push({
          id: String(id),
          name: (Array.isArray(rawNames) && rawNames[idx]) || scalarName || `Player ${id}`,
        });
      }
    });
  } else if (scalarId) {
    entries.push({
      id: String(scalarId),
      name: scalarName || `Player ${scalarId}`,
    });
  }

  const hasPerPlayerGoals =
    Array.isArray(rawPlayerGoals) &&
    rawPlayerGoals.length > 0 &&
    rawPlayerGoals.some((g: any) => g !== null && g !== undefined);

  const players: SidePlayerGoalStat[] = entries.map((entry, idx) => ({
    id: entry.id,
    name: entry.name,
    goalsScored: hasPerPlayerGoals && rawPlayerGoals[idx] !== null && rawPlayerGoals[idx] !== undefined
      ? Math.max(0, Number(rawPlayerGoals[idx]) || 0)
      : teamGoalsScored,
  }));

  return { players, teamGoalsScored, teamGoalsConceded };
}

/**
 * Normalizes a result payload row so Co-op per-player goal arrays cleanly sum into `home_goals` / `away_goals`
 * while non-Co-op rows keep scalar goals with `null` player goal arrays.
 */
export function normalizeResultGoals(result: any): {
  home_goals: number;
  away_goals: number;
  home_player_goals: number[] | null;
  away_player_goals: number[] | null;
} {
  const hasHomeArray = Array.isArray(result?.home_player_goals) && result.home_player_goals.length > 0;
  const hasAwayArray = Array.isArray(result?.away_player_goals) && result.away_player_goals.length > 0;

  const home_player_goals = hasHomeArray
    ? result.home_player_goals.map((v: any) => Math.max(0, Number(v) || 0))
    : null;
  const away_player_goals = hasAwayArray
    ? result.away_player_goals.map((v: any) => Math.max(0, Number(v) || 0))
    : null;

  const home_goals = home_player_goals
    ? home_player_goals.reduce((sum: number, g: number) => sum + g, 0)
    : Math.max(0, Number(result?.home_goals ?? 0) || 0);
  const away_goals = away_player_goals
    ? away_player_goals.reduce((sum: number, g: number) => sum + g, 0)
    : Math.max(0, Number(result?.away_goals ?? 0) || 0);

  return { home_goals, away_goals, home_player_goals, away_player_goals };
}

/**
 * Season 18+ opponent-category points lookup.
 */
export function getPointsForOpponentCategory(
  oppCategory: string,
  outcome: 'win' | 'draw' | 'loss'
): number {
  const cat = (oppCategory || '').toLowerCase();
  if (cat.includes('red') || cat === 'r') {
    if (outcome === 'win') return 8;
    if (outcome === 'draw') return 4;
    return -3;
  }
  if (cat.includes('black')) {
    if (outcome === 'win') return 7;
    if (outcome === 'draw') return 3;
    return -4;
  }
  if (cat.includes('blue') || cat === 'b') {
    if (outcome === 'win') return 6;
    if (outcome === 'draw') return 2;
    return -5;
  }
  if (cat.includes('white') || cat === 'w') {
    if (outcome === 'win') return 5;
    if (outcome === 'draw') return 1;
    return -6;
  }
  if (outcome === 'win') return 8;
  if (outcome === 'draw') return 4;
  return -3;
}

/**
 * Exact average category points across one (1v1) or multiple (Co-op 2v2) opponents.
 */
export function calculateAverageCategoryPoints(
  opponentCategories: string[],
  outcome: 'win' | 'draw' | 'loss'
): number {
  const valid = (opponentCategories || []).filter(Boolean);
  if (valid.length === 0) {
    return getPointsForOpponentCategory('RED', outcome);
  }
  const total = valid.reduce((sum, cat) => sum + getPointsForOpponentCategory(cat, outcome), 0);
  return total / valid.length;
}

/**
 * Aggregates Golden Boot & Golden Glove stats across matchups (handling Co-op arrays and per-player goals).
 */
export function aggregateMatchupAwardStats(matchups: any[]): Array<{
  player_id: string;
  player_name: string;
  total_goals: number;
  matches_played: number;
  goals_conceded: number;
  clean_sheets: number;
  goals_per_match: number;
}> {
  const byPlayer = new Map<
    string,
    {
      player_id: string;
      player_name: string;
      total_goals: number;
      matches_played: number;
      goals_conceded: number;
      clean_sheets: number;
    }
  >();

  for (const m of matchups) {
    if (m.is_null || m.home_goals === null || m.away_goals === null) continue;
    const homeSide = resolveSideGoalBreakdown(m, 'home');
    const awaySide = resolveSideGoalBreakdown(m, 'away');

    for (const hp of homeSide.players) {
      const prev = byPlayer.get(hp.id) || {
        player_id: hp.id,
        player_name: hp.name,
        total_goals: 0,
        matches_played: 0,
        goals_conceded: 0,
        clean_sheets: 0,
      };
      prev.total_goals += hp.goalsScored;
      prev.matches_played += 1;
      prev.goals_conceded += homeSide.teamGoalsConceded;
      if (homeSide.teamGoalsConceded === 0) prev.clean_sheets += 1;
      byPlayer.set(hp.id, prev);
    }

    for (const ap of awaySide.players) {
      const prev = byPlayer.get(ap.id) || {
        player_id: ap.id,
        player_name: ap.name,
        total_goals: 0,
        matches_played: 0,
        goals_conceded: 0,
        clean_sheets: 0,
      };
      prev.total_goals += ap.goalsScored;
      prev.matches_played += 1;
      prev.goals_conceded += awaySide.teamGoalsConceded;
      if (awaySide.teamGoalsConceded === 0) prev.clean_sheets += 1;
      byPlayer.set(ap.id, prev);
    }
  }

  return Array.from(byPlayer.values()).map((p) => ({
    ...p,
    goals_per_match: p.matches_played > 0 ? p.goals_conceded / p.matches_played : 0,
  }));
}

export interface TripleThreatCopyFixtureInput {
  id?: string;
  season_id?: string | null;
  round_number?: number | null;
  group_name?: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  status?: string | null;
  knockout_round?: string | null;
}

export interface TripleThreatCopyMatchupInput {
  position?: number;
  match_mode?: string | null;
  mode?: string | null;
  match_duration?: number | null;
  home_player_name?: string | null;
  away_player_name?: string | null;
  home_player_ids?: string[];
  home_player_names?: string[];
  away_player_ids?: string[];
  away_player_names?: string[];
  home_goals?: number | null;
  away_goals?: number | null;
  home_player_goals?: number[] | null;
  away_player_goals?: number[] | null;
}

function isScoredMatchup(m?: TripleThreatCopyMatchupInput | null): boolean {
  return Boolean(
    m &&
      m.home_goals !== null &&
      m.home_goals !== undefined &&
      m.away_goals !== null &&
      m.away_goals !== undefined &&
      String(m.home_goals) !== '' &&
      String(m.away_goals) !== ''
  );
}

function formatTripleThreatSideDisplay(
  names: string[] | undefined,
  fallbackName: string | null | undefined,
  playerGoals: number[] | null | undefined,
  scored: boolean
): string {
  const cleanNames =
    Array.isArray(names) && names.length > 0
      ? names.map((n) => String(n || '').trim().toUpperCase()).filter(Boolean)
      : fallbackName
        ? [String(fallbackName).trim().toUpperCase()]
        : [];

  if (cleanNames.length === 0) return 'TBD';

  if (
    scored &&
    cleanNames.length > 1 &&
    Array.isArray(playerGoals) &&
    playerGoals.length === cleanNames.length
  ) {
    return cleanNames.map((n, i) => `${n} (${Number(playerGoals[i] ?? 0)}G)`).join(' & ');
  }

  return cleanNames.join(' & ');
}

function formatMatchDurationTag(
  duration: number | null | undefined,
  fallbackDuration: number
): string {
  const mins = Number(duration);
  const valid = Number.isFinite(mins) && mins > 0 ? mins : fallbackDuration;
  return `⏱️ ${valid} MIN`;
}

function formatScoreValue(
  matchup: TripleThreatCopyMatchupInput | undefined
): string {
  if (!matchup || !isScoredMatchup(matchup)) return '__ – __';
  return `${Number(matchup.home_goals)} – ${Number(matchup.away_goals)}`;
}

/**
 * Formats a Triple Threat fixture + matchups into the official WhatsApp copy / share template.
 */
export function formatTripleThreatFixtureCopy(params: {
  fixture: TripleThreatCopyFixtureInput;
  matchups: TripleThreatCopyMatchupInput[];
}): string {
  const { fixture, matchups } = params;
  const divider = '━━━━━━━━━━━━━━━━━━';

  const seasonMatch = String(fixture.season_id || '').match(/\d+$/);
  const seasonNumber = seasonMatch ? seasonMatch[0] : '19';

  const roundStr = String(fixture.round_number || 1).padStart(2, '0');
  const knockoutLabelMap: Record<string, string> = {
    quarter_finals: 'QUARTER FINALS',
    semi_finals: 'SEMI FINALS',
    finals: 'FINALS',
    third_place: 'THIRD PLACE PLAYOFF',
  };
  const knockoutLabel = fixture.knockout_round
    ? knockoutLabelMap[fixture.knockout_round] ||
      String(fixture.knockout_round).replace(/_/g, ' ').toUpperCase()
    : '';
  const matchdayLine = knockoutLabel ? `📋 ${knockoutLabel}` : `📋 MATCHDAY – ${roundStr}`;

  const rawGroup =
    fixture.group_name ||
    String(fixture.id || '').match(/_grp([A-Za-z0-9]+)_/)?.[1] ||
    '';
  const cleanGroup = rawGroup.replace(/^group\s*[-–:]?\s*/i, '').trim().toUpperCase();
  const groupLine = cleanGroup
    ? `🏴 GROUP – ${cleanGroup}`
    : knockoutLabel
      ? null
      : '🏴 GROUP – ';

  const homeTeam = (fixture.home_team_name || 'HOME TEAM').trim().toUpperCase();
  const awayTeam = (fixture.away_team_name || 'AWAY TEAM').trim().toUpperCase();

  const sortedMatchups = [...(matchups || [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
  const coopMatch = sortedMatchups.find((m) => resolveTripleThreatMode(m) === 'coop');
  const duoMatches = sortedMatchups.filter((m) => resolveTripleThreatMode(m) === 'duo');
  const soloMatch = sortedMatchups.find((m) => resolveTripleThreatMode(m) === 'single');

  const ttRes = calculateTripleThreatFixture(
    sortedMatchups.map((m, idx) => ({
      position: m.position ?? idx + 1,
      mode: resolveTripleThreatMode(m),
      home_goals: m.home_goals,
      away_goals: m.away_goals,
    }))
  );

  // CO-OP (2V2)
  const coopScored = isScoredMatchup(coopMatch);
  const coopHome = coopMatch
    ? formatTripleThreatSideDisplay(
        coopMatch.home_player_names,
        coopMatch.home_player_name,
        coopMatch.home_player_goals,
        coopScored
      )
    : 'TBD';
  const coopAway = coopMatch
    ? formatTripleThreatSideDisplay(
        coopMatch.away_player_names,
        coopMatch.away_player_name,
        coopMatch.away_player_goals,
        coopScored
      )
    : 'TBD';

  const coopDurationTag = formatMatchDurationTag(coopMatch?.match_duration, 8);
  const coopSection = [
    `⚔️ CO-OP (2V2) • ${coopDurationTag}`,
    '',
    coopHome,
    '',
    '🆚',
    '',
    coopAway,
    '',
    `SCORE: ${formatScoreValue(coopMatch)}`,
  ].join('\n');

  // DUO (2 × 1V1 or legacy 2V2 fallback)
  let duoSection: string;
  if (duoMatches.length > 1) {
    const duoBlocks = duoMatches.map((dm, idx) => {
      const dScored = isScoredMatchup(dm);
      const dHome = formatTripleThreatSideDisplay(
        dm.home_player_names,
        dm.home_player_name,
        dm.home_player_goals,
        dScored
      );
      const dAway = formatTripleThreatSideDisplay(
        dm.away_player_names,
        dm.away_player_name,
        dm.away_player_goals,
        dScored
      );
      const dmDurationTag = formatMatchDurationTag(dm.match_duration, 6);
      return [
        `MATCH ${idx + 1} (${dmDurationTag}):`,
        dHome,
        '🆚',
        dAway,
        `SCORE: ${formatScoreValue(dm)}`,
      ].join('\n');
    });
    const duoTotalStr = ttRes.modeResults.duo.played
      ? `${ttRes.modeResults.duo.home_goals} – ${ttRes.modeResults.duo.away_goals}`
      : '__ – __';
    duoSection = [
      '⚔️ DUO (2 × 1V1)',
      '',
      ...duoBlocks.flatMap((block, idx) => (idx === 0 ? [block] : ['', block])),
      '',
      `DUO TOTAL: ${duoTotalStr}`,
    ].join('\n');
  } else {
    const soloDuo = duoMatches[0];
    const dScored = isScoredMatchup(soloDuo);
    const dHome = soloDuo
      ? formatTripleThreatSideDisplay(
          soloDuo.home_player_names,
          soloDuo.home_player_name,
          soloDuo.home_player_goals,
          dScored
        )
      : 'TBD';
    const dAway = soloDuo
      ? formatTripleThreatSideDisplay(
          soloDuo.away_player_names,
          soloDuo.away_player_name,
          soloDuo.away_player_goals,
          dScored
        )
      : 'TBD';
    const soloDuoDurationTag = formatMatchDurationTag(soloDuo?.match_duration, 6);
    duoSection = [
      `⚔️ DUO (2V2) • ${soloDuoDurationTag}`,
      '',
      dHome,
      '',
      '🆚',
      '',
      dAway,
      '',
      `SCORE: ${formatScoreValue(soloDuo)}`,
    ].join('\n');
  }

  // SOLO (1V1)
  const soloScored = isScoredMatchup(soloMatch);
  const soloHome = soloMatch
    ? formatTripleThreatSideDisplay(
        soloMatch.home_player_names,
        soloMatch.home_player_name,
        soloMatch.home_player_goals,
        soloScored
      )
    : 'TBD';
  const soloAway = soloMatch
    ? formatTripleThreatSideDisplay(
        soloMatch.away_player_names,
        soloMatch.away_player_name,
        soloMatch.away_player_goals,
        soloScored
      )
    : 'TBD';

  const soloDurationTag = formatMatchDurationTag(soloMatch?.match_duration, 6);
  const soloSection = [
    `⚔️ SOLO (1V1) • ${soloDurationTag}`,
    '',
    `HOME: ${soloHome}`,
    '🆚',
    `AWAY: ${soloAway}`,
    '',
    `SCORE: ${formatScoreValue(soloMatch)}`,
  ].join('\n');

  // Final Points, Bonus & Winner
  const hasAnyResults = sortedMatchups.some(isScoredMatchup);
  const allModesPlayed =
    ttRes.modeResults.coop.played &&
    ttRes.modeResults.duo.played &&
    ttRes.modeResults.single.played;
  const isComplete =
    allModesPlayed ||
    (hasAnyResults && String(fixture.status || '').toLowerCase() === 'completed');

  let finalHomeLine = '🏠 HOME TEAM: ';
  let finalAwayLine = '✈️ AWAY TEAM: ';
  let bonusLine = '🎯 BONUS POINT:';
  let winnerLine = '🏆 WINNER:';

  if (isComplete) {
    finalHomeLine = `🏠 HOME TEAM: ${ttRes.home_total_points} PTS`;
    finalAwayLine = `✈️ AWAY TEAM: ${ttRes.away_total_points} PTS`;

    const bonusText =
      ttRes.clean_sweep_team === 'home'
        ? `+1 (${homeTeam})`
        : ttRes.clean_sweep_team === 'away'
          ? `+1 (${awayTeam})`
          : 'None';
    bonusLine = `🎯 BONUS POINT: ${bonusText}`;

    const winnerText =
      ttRes.fixture_winner === 'home'
        ? homeTeam
        : ttRes.fixture_winner === 'away'
          ? awayTeam
          : 'DRAW';
    winnerLine = `🏆 WINNER: ${winnerText}`;
  } else if (hasAnyResults) {
    finalHomeLine = `🏠 HOME TEAM: ${ttRes.home_total_points} PTS (IN PROGRESS)`;
    finalAwayLine = `✈️ AWAY TEAM: ${ttRes.away_total_points} PTS (IN PROGRESS)`;
  }

  const parts: string[] = [
    `🏆 SS SUPER LEAGUE – SEASON ${seasonNumber}`,
    '⚔️ THE TRIPLE THREAT',
    '',
    divider,
    matchdayLine,
    divider,
    '',
  ];

  if (groupLine !== null) {
    parts.push(groupLine, '');
  }

  const coopMinutes =
    Number.isFinite(Number(coopMatch?.match_duration)) && Number(coopMatch?.match_duration) > 0
      ? Number(coopMatch?.match_duration)
      : 8;

  const duoDurations = duoMatches
    .map((m) => Number(m.match_duration))
    .filter((d) => Number.isFinite(d) && d > 0);
  const soloMinutes =
    Number.isFinite(Number(soloMatch?.match_duration)) && Number(soloMatch?.match_duration) > 0
      ? Number(soloMatch?.match_duration)
      : null;

  let duoSoloDurationLine = "⏱️ DUO & SOLO: HOME TEAM'S CHOICE";
  const allChoiceDurs = [...duoDurations, ...(soloMinutes !== null ? [soloMinutes] : [])];
  if (allChoiceDurs.length > 0) {
    const allSame = allChoiceDurs.every((d) => d === allChoiceDurs[0]);
    if (allSame) {
      duoSoloDurationLine = `⏱️ DUO & SOLO: ${allChoiceDurs[0]} MINUTES`;
    } else {
      const duoPart =
        duoDurations.length === 0
          ? "HOME TEAM'S CHOICE"
          : duoDurations.every((d) => d === duoDurations[0])
            ? `${duoDurations[0]} MIN`
            : duoDurations.map((d, i) => `M${i + 1}: ${d} MIN`).join(' / ');
      const soloPart = soloMinutes !== null ? `${soloMinutes} MIN` : "HOME TEAM'S CHOICE";
      duoSoloDurationLine = `⏱️ DUO: ${duoPart} • SOLO: ${soloPart}`;
    }
  }

  parts.push(
    `🏠 HOME TEAM: ${homeTeam}`,
    `✈️ AWAY TEAM: ${awayTeam}`,
    '',
    coopSection,
    '',
    duoSection,
    '',
    soloSection,
    '',
    divider,
    '📊 FINAL POINTS',
    '',
    finalHomeLine,
    finalAwayLine,
    '',
    bonusLine,
    winnerLine,
    divider,
    '',
    `⏱️ CO-OP: ${coopMinutes} MINUTES`,
    duoSoloDurationLine,
    '🟢 CONDITION: EXCELLENT',
    '',
    `SEASON ${seasonNumber} COMMITTEE`
  );

  return parts.join('\n');
}

function resolveLineupSlotNames(
  slot: any,
  playerNamesById?: Map<string, any> | Record<string, any>
): string {
  if (!slot) return 'TBD';
  const items = Array.isArray(slot) ? slot : [slot];
  const resolved = items
    .filter(Boolean)
    .map((item: any) => {
      const pid = typeof item === 'object' ? String(item.player_id || item.id || '').trim() : String(item).trim();
      let name = typeof item === 'object' ? String(item.player_name || item.name || '').trim() : '';
      if (!name && pid && playerNamesById) {
        const entry =
          playerNamesById instanceof Map
            ? playerNamesById.get(pid)
            : playerNamesById[pid];
        if (typeof entry === 'string') {
          name = entry.trim();
        } else if (entry && typeof entry === 'object') {
          name = String(entry.player_name || entry.name || '').trim();
        }
      }
      return (name || pid || 'TBD').toUpperCase();
    })
    .filter(Boolean);

  return resolved.length > 0 ? resolved.join(' & ') : 'TBD';
}

/**
 * Extracts a Triple Threat lineup structure ({ coop, duo, single }) for a team
 * directly from generated matchups when separate lineup records aren't loaded.
 */
export function extractTripleThreatLineupFromMatchups(
  matchups: any[],
  side: 'home' | 'away'
): { coop: any[]; duo: any[]; single: any[] } | null {
  if (!Array.isArray(matchups) || matchups.length === 0) return null;

  const isHome = side === 'home';
  const getSideNames = (m: any): string[] => {
    const arr = isHome ? m?.home_player_names : m?.away_player_names;
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((n: any) => String(n || '').trim()).filter(Boolean);
    }
    const singleName = isHome ? m?.home_player_name : m?.away_player_name;
    return singleName ? [String(singleName).trim()] : [];
  };

  const coopMatch = matchups.find((m) => m?.match_mode === 'coop') || matchups[0];
  const duoMatches = matchups.filter((m) => m?.match_mode === 'duo');
  const resolvedDuos =
    duoMatches.length > 0
      ? duoMatches
      : matchups.slice(1, matchups.length > 2 ? 3 : 2);
  const singleMatch =
    matchups.find((m) => m?.match_mode === 'single') || matchups[matchups.length - 1];

  const coop = coopMatch ? getSideNames(coopMatch) : [];
  const duo = resolvedDuos.flatMap((dm) => getSideNames(dm).slice(0, 1));
  const single = singleMatch ? getSideNames(singleMatch).slice(0, 1) : [];

  if (coop.length === 0 && duo.length === 0 && single.length === 0) {
    return null;
  }

  return { coop, duo, single };
}

/**
 * Formats a single team's Triple Threat lineup (Home or Away) for quick copy/share.
 */
export function formatTripleThreatLineupCopy(params: {
  teamName: string;
  side: 'home' | 'away';
  lineup: {
    coop?: any[];
    duo?: any[];
    single?: any[] | any;
  };
  fixture?: TripleThreatCopyFixtureInput | null;
  playerNamesById?: Map<string, any> | Record<string, any>;
}): string {
  const { teamName, side, lineup, fixture, playerNamesById } = params;
  const divider = '━━━━━━━━━━━━━━━━━━';

  const seasonMatch = String(fixture?.season_id || '').match(/\d+$/);
  const seasonNumber = seasonMatch ? seasonMatch[0] : '19';

  const roundStr = String(fixture?.round_number || 1).padStart(2, '0');
  const knockoutLabelMap: Record<string, string> = {
    quarter_finals: 'QUARTER FINALS',
    semi_finals: 'SEMI FINALS',
    finals: 'FINALS',
    third_place: 'THIRD PLACE PLAYOFF',
  };
  const knockoutLabel = fixture?.knockout_round
    ? knockoutLabelMap[fixture.knockout_round] ||
      String(fixture.knockout_round).replace(/_/g, ' ').toUpperCase()
    : '';
  const matchdayLine = knockoutLabel ? `📋 ${knockoutLabel}` : `📋 MATCHDAY – ${roundStr}`;

  const rawGroup =
    fixture?.group_name ||
    String(fixture?.id || '').match(/_grp([A-Za-z0-9]+)_/)?.[1] ||
    '';
  const cleanGroup = rawGroup.replace(/^group\s*[-–:]?\s*/i, '').trim().toUpperCase();

  const sideLabel = side === 'home' ? '🏠 HOME TEAM' : '✈️ AWAY TEAM';
  const cleanTeam = String(teamName || (side === 'home' ? 'HOME TEAM' : 'AWAY TEAM'))
    .trim()
    .toUpperCase();

  const coopText = resolveLineupSlotNames(lineup?.coop, playerNamesById);
  const duo1Text = resolveLineupSlotNames(lineup?.duo?.[0], playerNamesById);
  const duo2Text = resolveLineupSlotNames(lineup?.duo?.[1], playerNamesById);
  const singleRaw = Array.isArray(lineup?.single) ? lineup.single[0] : lineup?.single;
  const singleText = resolveLineupSlotNames(singleRaw, playerNamesById);

  const lines: string[] = [
    `🏆 SS SUPER LEAGUE – SEASON ${seasonNumber}`,
    '⚔️ THE TRIPLE THREAT LINEUP',
    '',
    divider,
    matchdayLine,
    divider,
    '',
  ];

  if (cleanGroup) {
    lines.push(`🏴 GROUP – ${cleanGroup}`, '');
  }

  lines.push(
    `${sideLabel}: ${cleanTeam}`,
    '',
    `🎮 CO-OP (2V2): ${coopText}`,
    `🤝 DUO #1 (1V1): ${duo1Text}`,
    `🤝 DUO #2 (1V1): ${duo2Text}`,
    `⚔️ SOLO (1V1): ${singleText}`,
  );

  return lines.join('\n');
}

/**
 * Computes the Away Team's lineup submission deadline in IST from `round_deadlines.round_start_time`
 * (with `home_fixture_deadline_time` and `lineup_deadline` fallbacks).
 */
export function computeAwayLineupDeadline(params: {
  scheduled_date?: string | Date | null;
  scheduled_date_str?: string | null;
  round_start_time?: string | null;
  home_fixture_deadline_time?: string | null;
  lineup_deadline?: string | Date | null;
  isTripleThreat?: boolean;
}): Date | null {
  const {
    scheduled_date,
    scheduled_date_str,
    round_start_time,
    home_fixture_deadline_time,
    lineup_deadline,
    isTripleThreat,
  } = params;

  const dateStr = extractISTDateString(scheduled_date_str || scheduled_date);

  if (dateStr) {
    const startTime =
      round_start_time && /^\d{2}:\d{2}$/.test(round_start_time)
        ? round_start_time
        : home_fixture_deadline_time || (isTripleThreat ? '09:00' : '17:00');
    const dt = new Date(`${dateStr}T${startTime}:00+05:30`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  if (lineup_deadline) {
    const dt = new Date(lineup_deadline);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return null;
}

/**
 * Determines whether a round has started based on round_deadlines status and round_start_time (IST).
 * Shared safely across both client components and server API routes.
 */
export function isRoundStartedFromDeadline(params: {
  round_status?: string | null;
  fixture_status?: string | null;
  scheduled_date?: string | Date | null;
  scheduled_date_str?: string | null;
  round_start_time?: string | null;
  now?: Date;
}): boolean {
  const {
    round_status,
    fixture_status,
    scheduled_date,
    scheduled_date_str,
    round_start_time,
    now = new Date(),
  } = params;

  const fStatus = String(fixture_status || '').toLowerCase();
  const rStatus = String(round_status || '').toLowerCase();

  if (['completed', 'finalized', 'closed'].includes(fStatus)) {
    return true;
  }

  if (
    ['active', 'in_progress', 'started', 'completed', 'finalized', 'closed', 'home_fixture', 'fixture_entry', 'result_entry'].includes(
      rStatus
    )
  ) {
    return true;
  }

  if (['paused', 'cancelled'].includes(rStatus)) {
    return false;
  }

  const dateStr = extractISTDateString(scheduled_date_str || scheduled_date);
  if (!dateStr) return false;

  const startTime =
    round_start_time && /^\d{2}:\d{2}$/.test(round_start_time)
      ? round_start_time
      : '09:00';
  const startAt = new Date(`${dateStr}T${startTime}:00+05:30`);
  if (Number.isNaN(startAt.getTime())) return false;

  return now >= startAt;
}
