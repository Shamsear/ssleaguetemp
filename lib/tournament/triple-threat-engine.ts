/**
 * SS TRIPLE THREAT - Calculation & Rules Engine
 * 
 * Rules:
 * 1. Three Modes per matchday:
 *    - Co-op Match (2v2)
 *    - Duo Match (2v2 Goal based)
 *    - Single Match (1v1)
 * 2. Exactly 5 unique players fielded per team per matchday:
 *    - Co-op: 2 players
 *    - Duo: 2 players
 *    - Single: 1 player
 *    - All 5 players must be unique (no overlap across modes)
 * 3. Match Points:
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
  home_points: number; // 3, 1, or 0
  away_points: number; // 3, 1, or 0
  home_bonus?: number; // 1 if clean sweep, else 0
  away_bonus?: number; // 1 if clean sweep, else 0
  outcome: 'home_win' | 'away_win' | 'draw';
}

export interface TripleThreatFixtureResult {
  matches: TripleThreatMatchResult[];
  matchResults: TripleThreatMatchResult[]; // Alias for backward compatibility
  home_matches_won: number;
  away_matches_won: number;
  draws: number;
  home_base_points: number;
  away_base_points: number;
  home_clean_sweep_bonus: number; // 1 if won all 3, else 0
  away_clean_sweep_bonus: number; // 1 if won all 3, else 0
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
 * Calculates matchday points, bonuses, and points-based GD for a Triple Threat fixture.
 */
export function calculateTripleThreatFixture(
  matches: TripleThreatMatchInput[]
): TripleThreatFixtureResult {
  let homeMatchesWon = 0;
  let awayMatchesWon = 0;
  let draws = 0;
  let homeBasePoints = 0;
  let awayBasePoints = 0;

  const rawMatches = matches.map((match, idx) => {
    const homeGoals = Number(match.home_goals ?? 0);
    const awayGoals = Number(match.away_goals ?? 0);

    let homePts = 0;
    let awayPts = 0;
    let outcome: 'home_win' | 'away_win' | 'draw' = 'draw';

    if (homeGoals > awayGoals) {
      homePts = 3;
      awayPts = 0;
      outcome = 'home_win';
      homeMatchesWon++;
    } else if (awayGoals > homeGoals) {
      homePts = 0;
      awayPts = 3;
      outcome = 'away_win';
      awayMatchesWon++;
    } else {
      homePts = 1;
      awayPts = 1;
      outcome = 'draw';
      draws++;
    }

    homeBasePoints += homePts;
    awayBasePoints += awayPts;

    return {
      position: match.position || idx + 1,
      mode: match.mode,
      home_goals: homeGoals,
      away_goals: awayGoals,
      home_points: homePts,
      away_points: awayPts,
      outcome,
    };
  });

  // Check Clean Sweep Bonus (+1 point if won all 3 modes)
  const isHomeCleanSweep = homeMatchesWon === 3;
  const isAwayCleanSweep = awayMatchesWon === 3;

  const homeBonus = isHomeCleanSweep ? 1 : 0;
  const awayBonus = isAwayCleanSweep ? 1 : 0;

  const processedMatches: TripleThreatMatchResult[] = rawMatches.map((m) => ({
    ...m,
    home_bonus: isHomeCleanSweep ? 1 : 0,
    away_bonus: isAwayCleanSweep ? 1 : 0,
  }));

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
