import { getTournamentDb, isTournamentDbAvailable } from '../neon/tournament-config';
import { getMainDb, isMainDbAvailable } from '../neon/main-config';

export interface ActiveSeasonPlayerInfo {
  team: string | null;
  category: string | null;
}

/**
 * Fetches the active season assignment (team and category/star) for a list of players.
 * If a player does not have a team or category in the active season, returns null.
 */
export async function getActiveSeasonPlayersMap(
  playerIds: string[]
): Promise<Map<string, ActiveSeasonPlayerInfo>> {
  const result = new Map<string, ActiveSeasonPlayerInfo>();
  if (!playerIds || playerIds.length === 0 || !isMainDbAvailable()) return result;

  try {
    const mainSql = getMainDb();
    const activeSeasons = await mainSql`
      SELECT id 
      FROM seasons 
      WHERE is_active = true OR status = 'active' 
      ORDER BY season_number DESC 
      LIMIT 1
    `;
    const activeSeasonId = activeSeasons[0]?.id;
    if (!activeSeasonId) return result;

    const tSql = isTournamentDbAvailable() ? getTournamentDb() : null;

    const [rpsRows, psRows, rpRows] = await Promise.all([
      tSql
        ? tSql`
            SELECT player_id, team, category 
            FROM realplayerstats 
            WHERE (player_id = ANY(${playerIds}) OR id = ANY(${playerIds})) 
              AND season_id = ${activeSeasonId}
          `.catch(() => [])
        : [],
      tSql
        ? tSql`
            SELECT player_id, team, category, star_rating 
            FROM player_seasons 
            WHERE (player_id = ANY(${playerIds}) OR id = ANY(${playerIds})) 
              AND season_id = ${activeSeasonId}
          `.catch(() => [])
        : [],
      mainSql`
        SELECT player_id, id, team, category_id, season_id 
        FROM realplayers 
        WHERE (player_id = ANY(${playerIds}) OR id = ANY(${playerIds})) 
          AND season_id = ${activeSeasonId}
      `.catch(() => []),
    ]);

    for (const pid of playerIds) {
      let rawTeam: string | null = null;
      let rawCat: string | null = null;
      let starRating: number | null = null;

      const rps = rpsRows.find((r: any) => r.player_id === pid || r.id === pid);
      if (rps) {
        if (rps.team) rawTeam = rps.team;
        if (rps.category) rawCat = rps.category;
      }

      const ps = psRows.find((r: any) => r.player_id === pid || r.id === pid);
      if (ps) {
        if (ps.team && !rawTeam) rawTeam = ps.team;
        if (ps.category && !rawCat) rawCat = ps.category;
        if (ps.star_rating) starRating = Number(ps.star_rating);
      }

      const rp = rpRows.find((r: any) => r.player_id === pid || r.id === pid);
      if (rp) {
        if (rp.team && !rawTeam) rawTeam = rp.team;
        if (rp.category_id && !rawCat) rawCat = rp.category_id;
      }

      let team: string | null = null;
      if (rawTeam && typeof rawTeam === 'string') {
        const cleanT = rawTeam.trim();
        const upperT = cleanT.toUpperCase();
        if (
          cleanT &&
          upperT !== 'UNKNOWN' &&
          upperT !== 'FREE AGENT' &&
          upperT !== 'NONE' &&
          upperT !== 'N/A' &&
          upperT !== 'NA'
        ) {
          team = cleanT;
        }
      }

      let category: string | null = null;
      if (starRating && starRating > 0) {
        category = `${starRating}★`;
      } else if (rawCat && typeof rawCat === 'string') {
        const cleanC = rawCat.trim();
        const upperC = cleanC.toUpperCase();
        if (
          cleanC &&
          upperC !== 'A' &&
          upperC !== 'NA' &&
          upperC !== 'N/A' &&
          upperC !== 'NONE' &&
          upperC !== 'UNKNOWN'
        ) {
          category = cleanC;
        }
      }

      result.set(pid, { team, category });
    }
  } catch (err) {
    console.error('Error in getActiveSeasonPlayersMap:', err);
  }

  return result;
}

export async function getPlayerActiveSeasonInfo(playerId: string): Promise<ActiveSeasonPlayerInfo> {
  const map = await getActiveSeasonPlayersMap([playerId]);
  return map.get(playerId) || { team: null, category: null };
}

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
  star_rating?: number;
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

export function normalizeTeam(team: string | null | undefined): string {
  if (!team || !team.trim() || team.trim().toLowerCase() === 'unknown') {
    return 'FREE AGENT';
  }
  return team.trim();
}

export function normalizeCategory(category: string | null | undefined, isS16orS17 = false): string {
  if (isS16orS17) {
    return 'NA';
  }
  if (!category || !category.trim()) {
    return 'NA';
  }
  const clean = category.trim();
  const upper = clean.toUpperCase();
  if (upper === 'A' || upper === 'NA' || upper === 'N/A' || upper === 'NONE') {
    return 'NA';
  }
  return clean;
}

/**
 * Fetches and resolves player season stats across tournament DB:
 * - Seasons 16 & 17: Retrieved from player_seasons table with base_points decreased (raw_points - base_points) and category = NA
 * - All other seasons: Retrieved from realplayerstats table, team defaults to FREE AGENT (never Unknown), category 'A' interpreted as 'NA'
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

        // 16 and 17 is in player_seasons with base points decreased and has NO category (used star_rating instead)
        if (isS16orS17 && ps) {
          const basePoints = parseInt(ps.base_points, 10) || 0;
          const rawPoints = parseInt(ps.points, 10) || 0;
          const adjustedPoints = rawPoints - basePoints;
          const starRating = ps.star_rating != null ? Number(ps.star_rating) : undefined;

          return {
            season_id: sId,
            team: normalizeTeam(ps.team || (rps && rps.team)),
            category: starRating ? `${starRating}★` : 'NA',
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
            star_rating: starRating,
          };
        }

        // All other seasons are in realplayerstats
        if (rps) {
          return {
            season_id: sId,
            team: normalizeTeam(rps.team),
            category: normalizeCategory(rps.category, isS16orS17),
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
