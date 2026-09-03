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

        const getPointsForOpponentCategory = (oppCategory: string, outcome: string) => {
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
        };

        const matchPoints = getPointsForOpponentCategory(match.opponentCat, res);

        totalPoints += matchPoints;
      }

      // Check if player row exists
      const existingRow = await tournamentDb`
        SELECT id FROM realplayerstats WHERE player_id = ${pData.playerId} AND season_id = ${pData.seasonId}
      `;

      if (existingRow.length > 0) {
        await tournamentDb`
          UPDATE realplayerstats SET
            player_name = ${pData.playerName},
            points = ${totalPoints},
            matches_played = ${matchesPlayed},
            goals_scored = ${goalsScored},
            goals_conceded = ${goalsConceded},
            wins = ${wins},
            draws = ${draws},
            losses = ${losses},
            clean_sheets = ${cleanSheets},
            motm_awards = ${motmAwards},
            processed_fixtures = ${JSON.stringify(pData.processedFixtures)}::jsonb,
            updated_at = NOW()
          WHERE player_id = ${pData.playerId} AND season_id = ${pData.seasonId}
        `;
      } else {
        await tournamentDb`
          INSERT INTO realplayerstats (
            id, player_id, player_name, season_id, team, team_id, category,
            points, matches_played, goals_scored, goals_conceded, wins, draws, losses, clean_sheets, motm_awards, processed_fixtures, updated_at
          ) VALUES (
            ${pData.statsId}, ${pData.playerId}, ${pData.playerName}, ${pData.seasonId}, ${pData.team}, ${pData.teamId}, ${pData.category},
            ${totalPoints}, ${matchesPlayed}, ${goalsScored}, ${goalsConceded}, ${wins}, ${draws}, ${losses}, ${cleanSheets}, ${motmAwards}, ${JSON.stringify(pData.processedFixtures)}::jsonb, NOW()
          )
        `;
      }

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
