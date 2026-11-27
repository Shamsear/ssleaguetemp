import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import {
  calculateAverageCategoryPoints,
  resolveSideGoalBreakdown,
} from '@/lib/tournament/triple-threat-engine';

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

        const actualPlayerId = String(playerInfo[0].player_id);
        const usesCategoryPoints = seasonNum >= 18;

        const rawMatchups = await sql`
          SELECT 
            m.*,
            f.home_team_name,
            f.away_team_name,
            f.status,
            p_home.category as home_category,
            p_away.category as away_category
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          LEFT JOIN realplayerstats p_home ON m.home_player_id = p_home.player_id AND p_home.season_id = ${seasonId}
          LEFT JOIN realplayerstats p_away ON m.away_player_id = p_away.player_id AND p_away.season_id = ${seasonId}
          WHERE m.season_id = ${seasonId}
            AND (
              m.home_player_id = ${actualPlayerId}
              OR m.away_player_id = ${actualPlayerId}
              OR ${actualPlayerId} = ANY(COALESCE(m.home_player_ids, ARRAY[]::text[]))
              OR ${actualPlayerId} = ANY(COALESCE(m.away_player_ids, ARRAY[]::text[]))
            )
            AND f.status = 'completed'
            AND m.home_goals IS NOT NULL
            AND m.away_goals IS NOT NULL
            AND m.round_number >= ${fromRound}
            AND m.round_number <= ${toRound}
          ORDER BY m.round_number ASC
        `;

        const playerCategoryMap = new Map<string, string>();
        if (usesCategoryPoints) {
          const catRows = await sql`
            SELECT player_id, category FROM realplayerstats WHERE season_id = ${seasonId}
          `;
          catRows.forEach((r: any) => {
            if (r.player_id && r.category) {
              playerCategoryMap.set(String(r.player_id), String(r.category));
            }
          });
        }

        const matchdayStats = rawMatchups.map((m: any) => {
          const homeSide = resolveSideGoalBreakdown(m, 'home');
          const awaySide = resolveSideGoalBreakdown(m, 'away');
          const homeEntry = homeSide.players.find((p) => p.id === actualPlayerId);
          const isHome = !!homeEntry;
          const ownEntry = isHome ? homeEntry! : awaySide.players.find((p) => p.id === actualPlayerId);

          const goalsScored = ownEntry ? ownEntry.goalsScored : (isHome ? homeSide.teamGoalsScored : awaySide.teamGoalsScored);
          const teamGoalsScored = isHome ? homeSide.teamGoalsScored : awaySide.teamGoalsScored;
          const goalsConceded = isHome ? homeSide.teamGoalsConceded : awaySide.teamGoalsConceded;
          const goalDifference = goalsScored - goalsConceded;
          const teamGD = teamGoalsScored - goalsConceded;
          const isNull = Boolean(m.is_null);

          const oppEntries = isHome ? awaySide.players : homeSide.players;
          const oppCats = oppEntries.map(
            (op) =>
              playerCategoryMap.get(op.id) ||
              (isHome ? m.away_category : m.home_category) ||
              'Red'
          );
          const formattedOppCat = oppCats
            .map((c) => String(c).replace(/^cat_/i, '').trim().toUpperCase())
            .join(' & ');

          let points = 0;
          let pointsReason = '';

          if (isNull) {
            points = 0;
            pointsReason = 'NULL MATCHUP (EXCLUDED - 0 Pts)';
          } else if (usesCategoryPoints) {
            const res: 'win' | 'draw' | 'loss' = teamGD > 0 ? 'win' : teamGD === 0 ? 'draw' : 'loss';
            points = calculateAverageCategoryPoints(oppCats, res);
            const sign = points >= 0 ? `+${points}` : `${points}`;
            pointsReason = `${res.toUpperCase()} VS ${formattedOppCat} (${sign} Pts)`;
          } else {
            const gd = goalsScored - goalsConceded;
            points = gd > 5 ? 5 : gd < -5 ? -5 : gd;
          }

          return {
            matchday: m.round_number,
            fixture_id: m.fixture_id,
            player_side: isHome ? 'home' : 'away',
            home_team_name: m.home_team_name,
            away_team_name: m.away_team_name,
            home_player_name: m.home_player_name,
            away_player_name: m.away_player_name,
            goals_scored: goalsScored,
            goals_conceded: goalsConceded,
            goal_difference: goalDifference,
            was_substitute: isHome ? Boolean(m.home_substituted) : Boolean(m.away_substituted),
            is_null: isNull,
            home_category: m.home_category,
            away_category: m.away_category,
            opponent_category: formattedOppCat,
            ...(pointsReason ? { points_reason: pointsReason } : {}),
            points,
          };
        });

        // Calculate total points (excluding null matches)
        const totalPoints = matchdayStats.reduce((sum: number, match: any) => sum + (match.is_null ? 0 : (match.points || 0)), 0);
        const validMatchesPlayed = matchdayStats.filter((m: any) => !m.is_null).length;

        return NextResponse.json({
            matchdayStats,
            totalPoints,
            matchesPlayed: validMatchesPlayed
        });
    } catch (error: any) {
        console.error('Error fetching player matchday stats:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch matchday stats' },
            { status: 500 }
        );
    }
}
