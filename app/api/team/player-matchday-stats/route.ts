import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET /api/team/player-matchday-stats
 * Get matchday-by-matchday breakdown for a specific player with round range filtering
 * Matches the pattern from committee/player-matchday-stats
 */
export async function GET(request: NextRequest) {
    try {
        // Verify authentication
        const { verifyAuth } = await import('@/lib/auth-helper');
        const auth = await verifyAuth(['team'], request);

        if (!auth.authenticated) {
            return NextResponse.json(
                { error: auth.error || 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const playerId = searchParams.get('player_id');
        const seasonId = searchParams.get('season_id');
        const fromRound = parseInt(searchParams.get('from_round') || '1');
        const toRound = parseInt(searchParams.get('to_round') || '999');

        if (!playerId || !seasonId) {
            return NextResponse.json(
                { error: 'player_id and season_id are required' },
                { status: 400 }
            );
        }

        const sql = getTournamentDb();

        const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
        const isModern = seasonNum === 16 || seasonNum === 17;

        // First, get the actual player_id from correct table
        let playerInfo;
        if (isModern) {
          playerInfo = await sql`
            SELECT player_id, player_name
            FROM player_seasons
            WHERE id = ${playerId}
            LIMIT 1
          `;
        } else {
          playerInfo = await sql`
            SELECT player_id, player_name
            FROM realplayerstats
            WHERE id = ${playerId}
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

        const usesCategoryPoints = seasonNum >= 18;

        // Get matchday-by-matchday stats for the player using the actual player_id
        // This query handles substitutions by checking both current and original player IDs
        const rawMatchdayStats = await sql`
      WITH player_matches AS (
        SELECT 
          m.fixture_id,
          m.round_number,
          m.home_player_id,
          m.away_player_id,
          m.home_original_player_id,
          m.away_original_player_id,
          m.home_substituted,
          m.away_substituted,
          m.home_goals,
          m.away_goals,
          m.home_player_name,
          m.away_player_name,
          m.home_original_player_name,
          m.away_original_player_name,
          f.home_team_name,
          f.away_team_name,
          f.status,
          CASE 
            -- Check if player is the current home player (either started or subbed in)
            WHEN m.home_player_id = ${actualPlayerId} THEN 'home'
            -- Check if player is the current away player (either started or subbed in)
            WHEN m.away_player_id = ${actualPlayerId} THEN 'away'
            -- Check if player was the original home player but got subbed out
            WHEN m.home_original_player_id = ${actualPlayerId} AND m.home_substituted = true THEN NULL
            -- Check if player was the original away player but got subbed out
            WHEN m.away_original_player_id = ${actualPlayerId} AND m.away_substituted = true THEN NULL
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
            -- Show if player was a substitute
            WHEN m.home_player_id = ${actualPlayerId} AND m.home_substituted = true THEN true
            WHEN m.away_player_id = ${actualPlayerId} AND m.away_substituted = true THEN true
            ELSE false
          END as was_substitute
        FROM matchups m
        JOIN fixtures f ON m.fixture_id = f.id
        WHERE m.season_id = ${seasonId}
        AND (
          m.home_player_id = ${actualPlayerId} 
          OR m.away_player_id = ${actualPlayerId}
        )
        AND f.status = 'completed'
        AND m.home_goals IS NOT NULL
        AND m.away_goals IS NOT NULL
        AND m.round_number >= ${fromRound}
        AND m.round_number <= ${toRound}
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
        pm.was_substitute,
        p_home.category as home_category,
        p_away.category as away_category
      FROM player_matches pm
      LEFT JOIN realplayerstats p_home ON pm.home_player_id = p_home.player_id AND p_home.season_id = ${seasonId}
      LEFT JOIN realplayerstats p_away ON pm.away_player_id = p_away.player_id AND p_away.season_id = ${seasonId}
      WHERE pm.player_side IS NOT NULL
      ORDER BY pm.round_number ASC
    `;

        let matchdayStats = rawMatchdayStats;

        if (usesCategoryPoints) {
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

        // Calculate total points
        const totalPoints = matchdayStats.reduce((sum: number, match: any) => sum + (match.points || 0), 0);

        return NextResponse.json({
            matchdayStats,
            totalPoints,
            matchesPlayed: matchdayStats.length
        });
    } catch (error: any) {
        console.error('Error fetching player matchday stats:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch matchday stats' },
            { status: 500 }
        );
    }
}
