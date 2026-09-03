import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * POST /api/admin/recalculate-all-player-stats
 *
 * Recalculates real player match statistics for all completed fixtures:
 * - matches_played
 * - wins, draws, losses
 * - goals_scored, goals_conceded
 * - clean_sheets
 * - motm_awards
 * - points (Category-based for Season 18+)
 * - processed_fixtures
 */
export async function POST(request: NextRequest) {
  try {
    const tournamentDb = getTournamentDb();
    console.log('🔄 Starting Full Real Player Stats Recalculation...');

    // 1. Fetch categories for category-based points calculation
    const categoriesMap = new Map<string, any>();
    try {
      const categoriesSnapshot = await adminDb.collection('categories').get();
      categoriesSnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        if (doc.id) categoriesMap.set(doc.id.toLowerCase(), data);
        if (data.name) categoriesMap.set(data.name.toLowerCase(), data);
      });
    } catch (err) {
      console.warn('Could not load categories, using default category rules:', err);
    }

    // Default categories fallback if map empty
    if (categoriesMap.size === 0) {
      categoriesMap.set('red', { priority: 1, points_same_category: 8, points_one_level_diff: 7, draw_same_category: 4, loss_same_category: 1 });
      categoriesMap.set('blue', { priority: 2, points_same_category: 8, points_one_level_diff: 7, draw_same_category: 4, loss_same_category: 1 });
      categoriesMap.set('black', { priority: 3, points_same_category: 8, points_one_level_diff: 7, draw_same_category: 4, loss_same_category: 1 });
      categoriesMap.set('white', { priority: 4, points_same_category: 8, points_one_level_diff: 7, draw_same_category: 4, loss_same_category: 1 });
    }

    // 2. Fetch completed fixtures & matchups
    const completedFixtures = await tournamentDb`
      SELECT id, season_id, round_number, motm_player_id
      FROM fixtures
      WHERE status = 'completed'
      ORDER BY round_number ASC
    `;

    const fixtureMotmMap = new Map<string, string>();
    completedFixtures.forEach((f: any) => {
      if (f.motm_player_id) fixtureMotmMap.set(f.id, f.motm_player_id);
    });

    const matchups = await tournamentDb`
      SELECT 
        m.*,
        f.season_id,
        f.round_number
      FROM matchups m
      JOIN fixtures f ON m.fixture_id = f.id
      WHERE f.status = 'completed'
        AND m.home_goals IS NOT NULL
        AND m.away_goals IS NOT NULL
    `;

    console.log(`📊 Processing ${completedFixtures.length} completed fixtures and ${matchups.length} matchups...`);

    // 3. Aggregate player stats
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
        isMotm: boolean;
        fixtureId: string;
      }>;
      processedFixtures: string[];
    }

    const playerAccumulators = new Map<string, PlayerStatAccumulator>();

    for (const m of matchups) {
      if (m.is_null) continue;
      const seasonId = m.season_id || 'SSPSLS18';

      // Home Player
      if (m.home_player_id) {
        const pId = String(m.home_player_id);
        const key = `${pId}_${seasonId}`;
        if (!playerAccumulators.has(key)) {
          playerAccumulators.set(key, {
            statsId: key,
            playerId: pId,
            playerName: m.home_player_name || 'Player ' + pId,
            seasonId: seasonId,
            team: m.home_team_name || '',
            teamId: m.home_team_id || '',
            category: m.home_category || 'Red',
            matches: [],
            processedFixtures: [],
          });
        }
        const acc = playerAccumulators.get(key)!;
        acc.matches.push({
          opponentId: String(m.away_player_id || ''),
          goalsScored: Number(m.home_goals) || 0,
          goalsConceded: Number(m.away_goals) || 0,
          isMotm: fixtureMotmMap.get(m.fixture_id) === pId,
          fixtureId: m.fixture_id,
        });
        if (!acc.processedFixtures.includes(m.fixture_id)) {
          acc.processedFixtures.push(m.fixture_id);
        }
      }

      // Away Player
      if (m.away_player_id) {
        const pId = String(m.away_player_id);
        const key = `${pId}_${seasonId}`;
        if (!playerAccumulators.has(key)) {
          playerAccumulators.set(key, {
            statsId: key,
            playerId: pId,
            playerName: m.away_player_name || 'Player ' + pId,
            seasonId: seasonId,
            team: m.away_team_name || '',
            teamId: m.away_team_id || '',
            category: m.away_category || 'Red',
            matches: [],
            processedFixtures: [],
          });
        }
        const acc = playerAccumulators.get(key)!;
        acc.matches.push({
          opponentId: String(m.home_player_id || ''),
          goalsScored: Number(m.away_goals) || 0,
          goalsConceded: Number(m.home_goals) || 0,
          isMotm: fixtureMotmMap.get(m.fixture_id) === pId,
          fixtureId: m.fixture_id,
        });
        if (!acc.processedFixtures.includes(m.fixture_id)) {
          acc.processedFixtures.push(m.fixture_id);
        }
      }
    }

    let updatedCount = 0;

    // 4. Calculate points and update database
    for (const [key, pData] of playerAccumulators.entries()) {
      const playerCat = pData.category.toLowerCase();
      const playerCatConfig = categoriesMap.get(playerCat) || categoriesMap.get('red');

      let totalPoints = 0;
      let matchesPlayed = pData.matches.length;
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

        const gd = match.goalsScored - match.goalsConceded;
        const res = gd > 0 ? 'win' : gd === 0 ? 'draw' : 'loss';
        if (res === 'win') wins++;
        else if (res === 'draw') draws++;
        else losses++;

        const oppKey = `${match.opponentId}_${pData.seasonId}`;
        const oppData = playerAccumulators.get(oppKey);
        const oppCat = (oppData?.category || 'red').toLowerCase();
        const oppCatConfig = categoriesMap.get(oppCat) || categoriesMap.get('red');

        let matchPoints = 0;
        if (playerCatConfig && oppCatConfig) {
          const levelDiff = Math.abs((Number(playerCatConfig.priority) || 1) - (Number(oppCatConfig.priority) || 1));
          if (res === 'win') {
            if (levelDiff === 0) matchPoints = Number(playerCatConfig.points_same_category) || 8;
            else if (levelDiff === 1) matchPoints = Number(playerCatConfig.points_one_level_diff) || 7;
            else if (levelDiff === 2) matchPoints = Number(playerCatConfig.points_two_level_diff) || 6;
            else matchPoints = Number(playerCatConfig.points_three_level_diff) || 5;
          } else if (res === 'draw') {
            if (levelDiff === 0) matchPoints = Number(playerCatConfig.draw_same_category) || 4;
            else if (levelDiff === 1) matchPoints = Number(playerCatConfig.draw_one_level_diff) || 3;
            else if (levelDiff === 2) matchPoints = Number(playerCatConfig.draw_two_level_diff) || 3;
            else matchPoints = Number(playerCatConfig.draw_three_level_diff) || 2;
          } else {
            if (levelDiff === 0) matchPoints = Number(playerCatConfig.loss_same_category) || 1;
            else if (levelDiff === 1) matchPoints = Number(playerCatConfig.loss_one_level_diff) || 1;
            else if (levelDiff === 2) matchPoints = Number(playerCatConfig.loss_two_level_diff) || 1;
            else matchPoints = Number(playerCatConfig.loss_three_level_diff) || 0;
          }
        } else {
          matchPoints = res === 'win' ? 8 : res === 'draw' ? 4 : 1;
        }

        totalPoints += matchPoints;
      }

      // Upsert realplayerstats table
      await tournamentDb`
        INSERT INTO realplayerstats (
          id, player_id, player_name, season_id, team, team_id, category,
          points, matches_played, goals_scored, goals_conceded, wins, draws, losses, clean_sheets, motm_awards, processed_fixtures, updated_at
        ) VALUES (
          ${pData.statsId}, ${pData.playerId}, ${pData.playerName}, ${pData.seasonId}, ${pData.team}, ${pData.teamId}, ${pData.category},
          ${totalPoints}, ${matchesPlayed}, ${goalsScored}, ${goalsConceded}, ${wins}, ${draws}, ${losses}, ${cleanSheets}, ${motmAwards}, ${JSON.stringify(pData.processedFixtures)}::jsonb, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          player_name = EXCLUDED.player_name,
          points = EXCLUDED.points,
          matches_played = EXCLUDED.matches_played,
          goals_scored = EXCLUDED.goals_scored,
          goals_conceded = EXCLUDED.goals_conceded,
          wins = EXCLUDED.wins,
          draws = EXCLUDED.draws,
          losses = EXCLUDED.losses,
          clean_sheets = EXCLUDED.clean_sheets,
          motm_awards = EXCLUDED.motm_awards,
          processed_fixtures = EXCLUDED.processed_fixtures,
          updated_at = NOW()
      `;

      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: 'Real player stats recalculated successfully',
      fixturesProcessed: completedFixtures.length,
      matchupsProcessed: matchups.length,
      playersUpdated: updatedCount,
    });
  } catch (error: any) {
    console.error('Error recalculating real player stats:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to recalculate player stats' }, { status: 500 });
  }
}
