import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getMainDb } from '@/lib/neon/main-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import {
  calculateAverageCategoryPoints,
  resolveSideGoalBreakdown,
} from '@/lib/tournament/triple-threat-engine';

export interface SyncPlayerStatsResult {
  success: boolean;
  seasonId: string;
  fixturesProcessed: number;
  matchupsProcessed: number;
  playersUpdated: number;
  error?: string;
}

interface PlayerStatAccumulator {
  statsId: string;
  playerId: string;
  playerName: string;
  seasonId: string;
  team: string;
  teamId: string;
  category: string;
  matches: Array<{
    opponentId: string;
    goalsScored: number;
    goalsConceded: number;
    teamGoalsScored: number;
    teamGoalsConceded: number;
    isMotm: boolean;
    fixtureId: string;
    opponentCats: string[];
  }>;
  processedFixtures: string[];
}

/**
 * Synchronizes and recalculates real player stats for a season directly from the source of truth
 * (completed fixtures + matchups).
 *
 * This function runs entirely within PostgreSQL (zero internal HTTP calls) and is 100% idempotent.
 * It ensures player statistics, points, wins, draws, losses, goals, clean sheets, and MOTM awards
 * never diverge when match results are entered, edited, marked null, or cancelled.
 */
export async function syncPlayerStatsForSeason(
  seasonId: string,
  customDb?: any
): Promise<SyncPlayerStatsResult> {
  if (!seasonId) {
    throw new Error('seasonId is required to sync player stats');
  }

  const tournamentDb = customDb || getTournamentDb();
  console.log(`🔄 [syncPlayerStatsForSeason] Starting stat sync for season ${seasonId}...`);

  // 1. Fetch categories for category-based points calculation
  const categoriesMap = new Map<string, any>();
  try {
    const categoriesSnapshot = await adminDb.collection('categories').get();
    categoriesSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      if (doc.id) categoriesMap.set(doc.id.toLowerCase(), data);
      if (data.name) categoriesMap.set(data.name.toLowerCase(), data);
    });
  } catch (err: any) {
    console.warn('[syncPlayerStatsForSeason] Could not load categories from adminDb, using default category rules:', err);
  }

  // Fallback category configs if empty
  if (categoriesMap.size === 0) {
    categoriesMap.set('red', { priority: 1 });
    categoriesMap.set('black', { priority: 2 });
    categoriesMap.set('blue', { priority: 3 });
    categoriesMap.set('white', { priority: 4 });
  }

  // 2. Fetch completed or null/cancelled fixtures for this season
  const completedFixtures = await tournamentDb`
    SELECT id, season_id, round_number, motm_player_id
    FROM fixtures
    WHERE (status = 'completed' OR status = 'cancelled' OR result = 'null') AND season_id = ${seasonId}
    ORDER BY round_number ASC
  `;

  const fixtureMotmMap = new Map<string, string>();
  completedFixtures.forEach((f: any) => {
    if (f.motm_player_id) {
      fixtureMotmMap.set(f.id, String(f.motm_player_id));
    }
  });

  // 3. Fetch matchups for completed or null/cancelled fixtures for this season
  const matchups = await tournamentDb`
    SELECT 
      m.*,
      f.season_id,
      f.round_number,
      rps_home.category as home_category,
      rps_away.category as away_category
    FROM matchups m
    JOIN fixtures f ON m.fixture_id = f.id
    LEFT JOIN realplayerstats rps_home ON (m.home_player_id = rps_home.player_id AND f.season_id = rps_home.season_id)
    LEFT JOIN realplayerstats rps_away ON (m.away_player_id = rps_away.player_id AND f.season_id = rps_away.season_id)
    WHERE (f.status = 'completed' OR f.status = 'cancelled' OR f.result = 'null')
      AND f.season_id = ${seasonId}
      AND m.home_goals IS NOT NULL
      AND m.away_goals IS NOT NULL
      AND (m.is_null IS NOT TRUE)
  `;

  console.log(`📊 [syncPlayerStatsForSeason] Processing ${completedFixtures.length} completed fixtures and ${matchups.length} matchups for ${seasonId}`);

  // 4. Pre-populate accumulators with all existing players for this season
  // This is critical: if a player's previous matches were removed, edited out, or marked null,
  // their stats will correctly reset instead of retaining stale values.
  const existingPlayers = await tournamentDb`
    SELECT id, player_id, player_name, season_id, team, team_id, category
    FROM realplayerstats
    WHERE season_id = ${seasonId}
  `;

  const playerAccumulators = new Map<string, PlayerStatAccumulator>();
  const playerCategoryMap = new Map<string, string>();

  for (const p of existingPlayers) {
    const key = String(p.player_id);
    if (p.category) {
      playerCategoryMap.set(key, String(p.category));
    }
    playerAccumulators.set(key, {
      statsId: p.id || `${p.player_id}_${seasonId}`,
      playerId: p.player_id,
      playerName: p.player_name,
      seasonId: seasonId,
      team: p.team || '',
      teamId: p.team_id || '',
      category: p.category || 'RED',
      matches: [],
      processedFixtures: [],
    });
  }

  // 5. Accumulate match statistics
  for (const m of matchups) {
    if (m.is_null) continue;

    const homeSide = resolveSideGoalBreakdown(m, 'home');
    const awaySide = resolveSideGoalBreakdown(m, 'away');
    const homeGoals = homeSide.teamGoalsScored;
    const awayGoals = awaySide.teamGoalsScored;

    const homeOpponentCats = awaySide.players.map(
      (ap) => playerCategoryMap.get(ap.id) || m.away_category || 'RED'
    );
    const awayOpponentCats = homeSide.players.map(
      (hp) => playerCategoryMap.get(hp.id) || m.home_category || 'RED'
    );

    // Home players
    for (const hp of homeSide.players) {
      const homePId = hp.id;
      if (!playerAccumulators.has(homePId)) {
        playerAccumulators.set(homePId, {
          statsId: `${homePId}_${seasonId}`,
          playerId: homePId,
          playerName: hp.name,
          seasonId: seasonId,
          team: m.home_team_name || '',
          teamId: m.home_team_id || '',
          category: m.home_category || 'RED',
          matches: [],
          processedFixtures: [],
        });
      }
      const acc = playerAccumulators.get(homePId)!;
      acc.matches.push({
        opponentId: awaySide.players[0]?.id || '',
        goalsScored: hp.goalsScored,
        goalsConceded: awayGoals,
        teamGoalsScored: homeGoals,
        teamGoalsConceded: awayGoals,
        isMotm: fixtureMotmMap.get(m.fixture_id) === homePId,
        fixtureId: m.fixture_id,
        opponentCats: homeOpponentCats.length > 0 ? homeOpponentCats : [m.away_category || 'RED'],
      });
      if (!acc.processedFixtures.includes(m.fixture_id)) {
        acc.processedFixtures.push(m.fixture_id);
      }
    }

    // Away players
    for (const ap of awaySide.players) {
      const awayPId = ap.id;
      if (!playerAccumulators.has(awayPId)) {
        playerAccumulators.set(awayPId, {
          statsId: `${awayPId}_${seasonId}`,
          playerId: awayPId,
          playerName: ap.name,
          seasonId: seasonId,
          team: m.away_team_name || '',
          teamId: m.away_team_id || '',
          category: m.away_category || 'RED',
          matches: [],
          processedFixtures: [],
        });
      }
      const acc = playerAccumulators.get(awayPId)!;
      acc.matches.push({
        opponentId: homeSide.players[0]?.id || '',
        goalsScored: ap.goalsScored,
        goalsConceded: homeGoals,
        teamGoalsScored: awayGoals,
        teamGoalsConceded: homeGoals,
        isMotm: fixtureMotmMap.get(m.fixture_id) === awayPId,
        fixtureId: m.fixture_id,
        opponentCats: awayOpponentCats.length > 0 ? awayOpponentCats : [m.home_category || 'RED'],
      });
      if (!acc.processedFixtures.includes(m.fixture_id)) {
        acc.processedFixtures.push(m.fixture_id);
      }
    }
  }

  // 6. Calculate total points and update database
  const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
  const usesCategoryPoints = seasonNum >= 18;

  const playerUpdates: Array<{
    statsId: string;
    playerId: string;
    playerName: string;
    seasonId: string;
    team: string;
    teamId: string;
    category: string;
    totalPoints: number;
    matchesPlayed: number;
    goalsScored: number;
    goalsConceded: number;
    wins: number;
    draws: number;
    losses: number;
    cleanSheets: number;
    motmAwards: number;
    processedFixtures: string[];
  }> = [];

  for (const [, pData] of playerAccumulators.entries()) {
    let totalPoints = 0;
    const matchesPlayed = pData.matches.length;
    let goalsScored = 0;
    let goalsConceded = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let cleanSheets = 0;
    let motmAwards = 0;

    for (const match of pData.matches) {
      goalsScored += match.goalsScored;
      goalsConceded += match.goalsConceded;
      if (match.goalsConceded === 0) cleanSheets++;
      if (match.isMotm) motmAwards++;

      const teamGD = match.teamGoalsScored - match.teamGoalsConceded;
      const res: 'win' | 'draw' | 'loss' = teamGD > 0 ? 'win' : teamGD === 0 ? 'draw' : 'loss';
      if (res === 'win') wins++;
      else if (res === 'draw') draws++;
      else losses++;

      let matchPoints = 0;
      if (usesCategoryPoints) {
        matchPoints = calculateAverageCategoryPoints(match.opponentCats, res);
      } else {
        matchPoints = Math.max(-5, Math.min(5, match.goalsScored - match.goalsConceded));
      }

      totalPoints += matchPoints;
    }

    playerUpdates.push({
      statsId: pData.statsId,
      playerId: pData.playerId,
      playerName: pData.playerName,
      seasonId: pData.seasonId,
      team: pData.team,
      teamId: pData.teamId,
      category: pData.category,
      totalPoints,
      matchesPlayed,
      goalsScored,
      goalsConceded,
      wins,
      draws,
      losses,
      cleanSheets,
      motmAwards,
      processedFixtures: pData.processedFixtures,
    });
  }

  // 7. Write to PostgreSQL in batches
  const BATCH_SIZE = 15;
  for (let i = 0; i < playerUpdates.length; i += BATCH_SIZE) {
    const batch = playerUpdates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (u) => {
        const existing = await tournamentDb`
          SELECT id FROM realplayerstats WHERE player_id = ${u.playerId} AND season_id = ${u.seasonId} LIMIT 1
        `;

        if (existing.length > 0) {
          await tournamentDb`
            UPDATE realplayerstats SET
              player_name = ${u.playerName},
              points = ${u.totalPoints},
              matches_played = ${u.matchesPlayed},
              goals_scored = ${u.goalsScored},
              goals_conceded = ${u.goalsConceded},
              wins = ${u.wins},
              draws = ${u.draws},
              losses = ${u.losses},
              clean_sheets = ${u.cleanSheets},
              motm_awards = ${u.motmAwards},
              processed_fixtures = ${JSON.stringify(u.processedFixtures)}::jsonb,
              updated_at = NOW()
            WHERE player_id = ${u.playerId} AND season_id = ${u.seasonId}
          `;
        } else {
          await tournamentDb`
            INSERT INTO realplayerstats (
              id, player_id, player_name, season_id, team, team_id, category,
              points, matches_played, goals_scored, goals_conceded, wins, draws, losses,
              clean_sheets, motm_awards, processed_fixtures, updated_at
            ) VALUES (
              ${u.statsId}, ${u.playerId}, ${u.playerName}, ${u.seasonId}, ${u.team}, ${u.teamId}, ${u.category},
              ${u.totalPoints}, ${u.matchesPlayed}, ${u.goalsScored}, ${u.goalsConceded}, ${u.wins}, ${u.draws}, ${u.losses},
              ${u.cleanSheets}, ${u.motmAwards}, ${JSON.stringify(u.processedFixtures)}::jsonb, NOW()
            )
          `;
        }
      })
    );
  }

  // 8. Safely update Neon realplayers profile table in background
  try {
    const mainSql = getMainDb();
    const profileBatch = playerUpdates.slice(0, 100);
    for (let i = 0; i < profileBatch.length; i += BATCH_SIZE) {
      const batch = profileBatch.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (u) => {
          await mainSql`
            UPDATE realplayers
            SET points = ${u.totalPoints}, category_name = ${u.category}, updated_at = NOW()
            WHERE player_id = ${u.playerId} OR id = ${u.playerId}
          `;
        })
      );
    }
  } catch (neonErr) {
    console.warn('[syncPlayerStatsForSeason] Non-critical: could not update realplayers profile table:', neonErr);
  }

  console.log(`✅ [syncPlayerStatsForSeason] Successfully synced ${playerUpdates.length} players for season ${seasonId}`);

  return {
    success: true,
    seasonId,
    fixturesProcessed: completedFixtures.length,
    matchupsProcessed: matchups.length,
    playersUpdated: playerUpdates.length,
  };
}
