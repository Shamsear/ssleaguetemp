import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const player_id = searchParams.get('player_id');
    const season_id = searchParams.get('season_id') || 'SSPSLS16';

    if (!player_id) {
      return NextResponse.json(
        { error: 'player_id is required' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();

    const seasonNum = parseInt(season_id.replace(/\D/g, '')) || 0;
    const usesCategoryPoints = seasonNum >= 18;
    const isModern = seasonNum === 16 || seasonNum === 17;

    // First, get the actual player_id from the correct table
    let playerInfo;
    if (!usesCategoryPoints) {
      playerInfo = await sql`
        SELECT player_id, player_name
        FROM player_seasons
        WHERE id = ${player_id}
        LIMIT 1
      `;
    } else {
      playerInfo = await sql`
        SELECT player_id, player_name
        FROM realplayerstats
        WHERE id = ${player_id}
        LIMIT 1
      `;
    }

    if (playerInfo.length === 0) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const actualPlayerId = playerInfo[0].player_id;

    // Get matchday-by-matchday stats for the player using the actual player_id
    let rawMatchdayStats;
    if (usesCategoryPoints) {
      rawMatchdayStats = await sql`
        WITH player_matches AS (
          SELECT 
            m.fixture_id,
            m.round_number,
            m.home_player_id,
            m.away_player_id,
            m.home_goals,
            m.away_goals,
            m.home_player_name,
            m.away_player_name,
            f.home_team_name,
            f.away_team_name,
            f.status,
            CASE 
              WHEN m.home_player_id = ${actualPlayerId} THEN 'home'
              WHEN m.away_player_id = ${actualPlayerId} THEN 'away'
            END as player_side,
            CASE 
              WHEN m.home_player_id = ${actualPlayerId} THEN m.home_goals
              WHEN m.away_player_id = ${actualPlayerId} THEN m.away_goals
            END as goals_scored,
            CASE 
              WHEN m.home_player_id = ${actualPlayerId} THEN m.away_goals
              WHEN m.away_player_id = ${actualPlayerId} THEN m.home_goals
            END as goals_conceded,
            CASE
              WHEN m.home_player_id = ${actualPlayerId} AND m.home_substituted = true THEN true
              WHEN m.away_player_id = ${actualPlayerId} AND m.away_substituted = true THEN true
              ELSE false
            END as was_substitute
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE m.season_id = ${season_id}
          AND (
            m.home_player_id = ${actualPlayerId} 
            OR m.away_player_id = ${actualPlayerId}
          )
          AND f.status = 'completed'
          AND m.home_goals IS NOT NULL
          AND m.away_goals IS NOT NULL
        )
        SELECT 
          pm.round_number as matchday,
          pm.fixture_id,
          pm.player_side,
          pm.home_team_name,
          pm.away_team_name,
          pm.home_player_name,
          pm.away_player_name,
          pm.goals_scored,
          pm.goals_conceded,
          (pm.goals_scored - pm.goals_conceded) as goal_difference,
          pm.was_substitute,
          p_home.category as home_category,
          p_away.category as away_category
        FROM player_matches pm
        LEFT JOIN realplayerstats p_home ON pm.home_player_id = p_home.player_id AND p_home.season_id = ${season_id}
        LEFT JOIN realplayerstats p_away ON pm.away_player_id = p_away.player_id AND p_away.season_id = ${season_id}
        WHERE pm.player_side IS NOT NULL
        ORDER BY pm.round_number ASC
      `;
    } else {
      rawMatchdayStats = await sql`
        WITH player_matches AS (
          SELECT 
            m.fixture_id,
            m.round_number,
            m.home_player_id,
            m.away_player_id,
            m.home_goals,
            m.away_goals,
            m.home_player_name,
            m.away_player_name,
            f.home_team_name,
            f.away_team_name,
            f.status,
            CASE 
              WHEN m.home_player_id = ${actualPlayerId} THEN 'home'
              WHEN m.away_player_id = ${actualPlayerId} THEN 'away'
            END as player_side,
            CASE 
              WHEN m.home_player_id = ${actualPlayerId} THEN m.home_goals
              WHEN m.away_player_id = ${actualPlayerId} THEN m.away_goals
            END as goals_scored,
            CASE 
              WHEN m.home_player_id = ${actualPlayerId} THEN m.away_goals
              WHEN m.away_player_id = ${actualPlayerId} THEN m.home_goals
            END as goals_conceded,
            CASE
              WHEN m.home_player_id = ${actualPlayerId} AND m.home_substituted = true THEN true
              WHEN m.away_player_id = ${actualPlayerId} AND m.away_substituted = true THEN true
              ELSE false
            END as was_substitute
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE m.season_id = ${season_id}
          AND (
            m.home_player_id = ${actualPlayerId} 
            OR m.away_player_id = ${actualPlayerId}
          )
          AND f.status = 'completed'
          AND m.home_goals IS NOT NULL
          AND m.away_goals IS NOT NULL
        )
        SELECT 
          pm.round_number as matchday,
          pm.fixture_id,
          pm.player_side,
          pm.home_team_name,
          pm.away_team_name,
          pm.home_player_name,
          pm.away_player_name,
          pm.goals_scored,
          pm.goals_conceded,
          (pm.goals_scored - pm.goals_conceded) as goal_difference,
          CASE 
            WHEN (pm.goals_scored - pm.goals_conceded) > 5 THEN 5
            WHEN (pm.goals_scored - pm.goals_conceded) < -5 THEN -5
            ELSE (pm.goals_scored - pm.goals_conceded)
          END as points,
          pm.was_substitute
        FROM player_matches pm
        WHERE pm.player_side IS NOT NULL
        ORDER BY pm.round_number ASC
      `;
    }

    let matchdayStats = rawMatchdayStats;

    if (usesCategoryPoints) {
      // Fetch Firestore categories to calculate category points dynamically
      const categoriesSnapshot = await adminDb.collection('categories').get();
      const categoriesMap = new Map();
      categoriesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        categoriesMap.set(doc.id.toLowerCase(), data);
        if (data.name) {
          categoriesMap.set(data.name.toLowerCase(), data);
        }
      });

      matchdayStats = rawMatchdayStats.map((match: any) => {
        const homeCat = (match.home_category || '').trim().toLowerCase();
        const awayCat = (match.away_category || '').trim().toLowerCase();
        const homeCatConfig = categoriesMap.get(homeCat);
        const awayCatConfig = categoriesMap.get(awayCat);

        let points = 0;
        const gd = match.goals_scored - match.goals_conceded;
        const res = gd > 0 ? 'win' : (gd === 0 ? 'draw' : 'loss');

        if (homeCatConfig && awayCatConfig) {
          const levelDiff = Math.abs((Number(homeCatConfig.priority) || 1) - (Number(awayCatConfig.priority) || 1));
          const playerCatConfig = match.player_side === 'home' ? homeCatConfig : awayCatConfig;

          const getPoints = (cfg: any, diff: number, outcome: string) => {
            if (outcome === 'win') {
              if (diff === 0) return Number(cfg.points_same_category) || 0;
              if (diff === 1) return Number(cfg.points_one_level_diff) || 0;
              if (diff === 2) return Number(cfg.points_two_level_diff) || 0;
              return Number(cfg.points_three_level_diff) || 0;
            } else if (outcome === 'draw') {
              if (diff === 0) return Number(cfg.draw_same_category) || 0;
              if (diff === 1) return Number(cfg.draw_one_level_diff) || 0;
              if (diff === 2) return Number(cfg.draw_two_level_diff) || 0;
              return Number(cfg.draw_three_level_diff) || 0;
            } else {
              if (diff === 0) return Number(cfg.loss_same_category) || 0;
              if (diff === 1) return Number(cfg.loss_one_level_diff) || 0;
              if (diff === 2) return Number(cfg.loss_two_level_diff) || 0;
              return Number(cfg.loss_three_level_diff) || 0;
            }
          };

          points = getPoints(playerCatConfig, levelDiff, res);
        } else {
          points = Math.max(-5, Math.min(5, gd));
        }

        return {
          ...match,
          points
        };
      });
    }

    // Calculate total points based on calculated/mapped matchday points
    const totalPoints = matchdayStats.reduce((sum: number, match: any) => sum + (match.points || 0), 0);

    return NextResponse.json({ 
      matchdayStats,
      totalPoints,
      matchesPlayed: matchdayStats.length
    });
  } catch (error) {
    console.error('Error fetching player matchday stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player matchday stats' },
      { status: 500 }
    );
  }
}
