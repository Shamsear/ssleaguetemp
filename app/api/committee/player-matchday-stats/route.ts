import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

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

      const getCategoryConfig = (catStr: string) => {
        const c = (catStr || '').trim().toLowerCase();
        if (categoriesMap.has(c)) return categoriesMap.get(c);
        if (c.includes('red') || c.includes('legend') || c === 'r') return categoriesMap.get('red') || categoriesMap.get('cat_red') || { priority: 1, name: 'Red' };
        if (c.includes('black') || c.includes('elite')) return categoriesMap.get('black') || categoriesMap.get('cat_black') || { priority: 2, name: 'Black' };
        if (c.includes('blue') || c.includes('pro') || c === 'b') return categoriesMap.get('blue') || categoriesMap.get('cat_blue') || { priority: 3, name: 'Blue' };
        if (c.includes('white') || c.includes('amateur') || c === 'w') return categoriesMap.get('white') || categoriesMap.get('cat_white') || { priority: 4, name: 'White' };
        return { priority: 1, name: 'Red' };
      };

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

      matchdayStats = rawMatchdayStats.map((match: any) => {
        const gd = match.goals_scored - match.goals_conceded;
        const res = gd > 0 ? 'win' : (gd === 0 ? 'draw' : 'loss');

        const oppCat = (match.player_side === 'home' ? match.away_category : match.home_category) || 'Red';
        const points = getPointsForOpponentCategory(oppCat, res);
        const sign = points >= 0 ? `+${points}` : `${points}`;
        const pointsReason = `${res.toUpperCase()} VS ${oppCat.toUpperCase()} (${sign} Pts)`;

        return {
          ...match,
          opponent_category: oppCat.toUpperCase(),
          points_reason: pointsReason,
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
