import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import {
  calculateAverageCategoryPoints,
  resolveSideGoalBreakdown,
} from '@/lib/tournament/triple-threat-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const actualPlayerId = String(playerInfo[0].player_id);

    // Fetch matchups involving this player (covers both 1v1 scalar IDs and Co-op 2v2 player_ids arrays)
    const rawMatchups = await sql`
      SELECT 
        m.*,
        f.home_team_name,
        f.away_team_name,
        f.status,
        rps_home.category as home_category,
        rps_away.category as away_category
      FROM matchups m
      JOIN fixtures f ON m.fixture_id = f.id
      LEFT JOIN realplayerstats rps_home ON m.home_player_id = rps_home.player_id AND rps_home.season_id = ${season_id}
      LEFT JOIN realplayerstats rps_away ON m.away_player_id = rps_away.player_id AND rps_away.season_id = ${season_id}
      WHERE m.season_id = ${season_id}
        AND (
          m.home_player_id = ${actualPlayerId}
          OR m.away_player_id = ${actualPlayerId}
          OR ${actualPlayerId} = ANY(COALESCE(m.home_player_ids, ARRAY[]::text[]))
          OR ${actualPlayerId} = ANY(COALESCE(m.away_player_ids, ARRAY[]::text[]))
        )
        AND (f.status = 'completed' OR f.status = 'cancelled' OR f.result = 'null')
        AND m.home_goals IS NOT NULL
        AND m.away_goals IS NOT NULL
      ORDER BY m.round_number ASC
    `;

    // Map all player categories for exact Co-op opponent category lookup
    const playerCategoryMap = new Map<string, string>();
    if (usesCategoryPoints) {
      const catRows = await sql`
        SELECT player_id, category FROM realplayerstats WHERE season_id = ${season_id}
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

    // Calculate total points based on calculated/mapped matchday points (excluding null matches)
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
      { error: 'Failed to fetch player matchday stats' },
      { status: 500 }
    );
  }
}
