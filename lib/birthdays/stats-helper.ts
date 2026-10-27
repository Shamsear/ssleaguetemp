import { getTournamentDb, isTournamentDbAvailable } from '../neon/tournament-config';

export interface PlayerSeasonRecord {
  season_id: string;
  team: string;
  category: string;
  matches: number;
  goals: number;
  goals_conceded: number;
  wins: number;
  draws: number;
  losses: number;
  clean_sheets: number;
  motm_awards: number;
  points: number;
  base_points?: number;
  raw_points?: number;
}

export interface PlayerAggregatedStats {
  matches: number;
  goals: number;
  goals_conceded: number;
  wins: number;
  draws: number;
  losses: number;
  clean_sheets: number;
  motm_awards: number;
  points: number;
}

/**
 * Fetches and resolves player season stats across tournament DB:
 * - Seasons 16 & 17: Retrieved from player_seasons table with base_points decreased (raw_points - base_points)
 * - All other seasons: Retrieved from realplayerstats table
 */
export async function getPlayerTournamentHistory(playerId: string): Promise<{
  seasons: PlayerSeasonRecord[];
  aggregatedStats: PlayerAggregatedStats;
}> {
  const emptyResult = {
    seasons: [],
    aggregatedStats: {
      matches: 0,
      goals: 0,
      goals_conceded: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      clean_sheets: 0,
      motm_awards: 0,
      points: 0,
    },
  };

  if (!isTournamentDbAvailable()) {
    return emptyResult;
  }

  try {
    const tSql = getTournamentDb();

    // Query realplayerstats and player_seasons (for S16 and S17)
    const [rpsRows, psRows] = await Promise.all([
      tSql`
        SELECT * FROM realplayerstats
        WHERE player_id = ${playerId} OR id = ${playerId}
        ORDER BY season_id ASC
      `.catch(() => []),
      tSql`
        SELECT * FROM player_seasons
        WHERE (player_id = ${playerId} OR id = ${playerId})
          AND season_id IN ('SSPSLS16', 'SSPSLS17')
      `.catch(() => []),
    ]);

    const psMap = new Map<string, any>();
    psRows.forEach((ps: any) => {
      const sId = (ps.season_id || '').toUpperCase();
      psMap.set(sId, ps);
    });

    const allSeasonIds = Array.from(
      new Set([
        ...rpsRows.map((r: any) => (r.season_id || '').toUpperCase()),
        ...psRows.map((p: any) => (p.season_id || '').toUpperCase()),
      ])
    ).filter(Boolean);

    const seasons: PlayerSeasonRecord[] = allSeasonIds
      .map((sId: string): PlayerSeasonRecord | null => {
        const isS16orS17 = sId === 'SSPSLS16' || sId === 'SSPSLS17';
        const ps = psMap.get(sId);
        const rps = rpsRows.find((r: any) => (r.season_id || '').toUpperCase() === sId);

        // 16 and 17 is in player_seasons with base points decreased
        if (isS16orS17 && ps) {
          const basePoints = parseInt(ps.base_points, 10) || 0;
          const rawPoints = parseInt(ps.points, 10) || 0;
          const adjustedPoints = rawPoints - basePoints;

          return {
            season_id: sId,
            team: ps.team || (rps && rps.team) || 'Unknown',
            category: ps.category || (rps && rps.category) || 'Red',
            matches: Number(ps.matches_played || 0),
            goals: Number(ps.goals_scored || 0),
            goals_conceded: Number(ps.goals_conceded || 0),
            wins: Number(ps.wins || 0),
            draws: Number(ps.draws || 0),
            losses: Number(ps.losses || 0),
            clean_sheets: Number(ps.clean_sheets || 0),
            motm_awards: Number(ps.motm_awards || 0),
            points: adjustedPoints,
            base_points: basePoints,
            raw_points: rawPoints,
          };
        }

        // All other seasons are in realplayerstats
        if (rps) {
          // If for some reason S16/S17 was not in player_seasons, but in realplayerstats, still handle gracefully
          return {
            season_id: sId,
            team: rps.team || 'Unknown',
            category: rps.category || 'Red',
            matches: Number(rps.matches_played || 0),
            goals: Number(rps.goals_scored || 0),
            goals_conceded: Number(rps.goals_conceded || 0),
            wins: Number(rps.wins || rps.matches_won || 0),
            draws: Number(rps.draws || rps.matches_drawn || 0),
            losses: Number(rps.losses || rps.matches_lost || 0),
            clean_sheets: Number(rps.clean_sheets || 0),
            motm_awards: Number(rps.motm_awards || 0),
            points: Number(rps.points || 0),
          };
        }

        return null;
      })
      .filter((s): s is PlayerSeasonRecord => s !== null);

    // Sort chronologically by season number (S6, S7, ... S16, S17, S18)
    seasons.sort((a, b) => {
      const numA = parseInt(a.season_id.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.season_id.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    const aggregatedStats: PlayerAggregatedStats = seasons.reduce(
      (acc, s) => {
        acc.matches += s.matches;
        acc.goals += s.goals;
        acc.goals_conceded += s.goals_conceded;
        acc.wins += s.wins;
        acc.draws += s.draws;
        acc.losses += s.losses;
        acc.clean_sheets += s.clean_sheets;
        acc.motm_awards += s.motm_awards;
        acc.points += s.points;
        return acc;
      },
      {
        matches: 0,
        goals: 0,
        goals_conceded: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        clean_sheets: 0,
        motm_awards: 0,
        points: 0,
      }
    );

    return { seasons, aggregatedStats };
  } catch (error) {
    console.error('Error in getPlayerTournamentHistory:', error);
    return emptyResult;
  }
}
