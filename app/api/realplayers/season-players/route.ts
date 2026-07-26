import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET /api/realplayers/season-players?seasonId=SSPSLS18
 *
 * Returns all players for S18+ seasons from realplayerstats,
 * including base_price (set from category) and price (set when sold to a team).
 * For S16/S17, falls back to player_seasons.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');

    if (!seasonId) {
      return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
    }

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    const sql = getTournamentDb();

    let players;

    if (isModern) {
      // S16 / S17 — read from player_seasons
      players = await sql`
        SELECT
          id,
          player_id,
          player_name,
          season_id,
          team,
          team_id,
          category,
          star_rating,
          NULL::int  AS base_price,
          NULL::int  AS price,
          auction_value,
          points,
          matches_played,
          goals_scored,
          goals_conceded,
          (goals_scored - goals_conceded) AS goal_difference,
          wins,
          draws,
          losses,
          clean_sheets,
          assists,
          motm_awards
        FROM player_seasons
        WHERE season_id = ${seasonId}
        ORDER BY player_name
      `;
    } else {
      // S18+ — read from realplayerstats
      players = await sql`
        SELECT
          id,
          player_id,
          player_name,
          season_id,
          team,
          team_id,
          category,
          NULL::int  AS star_rating,
          base_price,
          price,
          points,
          matches_played,
          goals_scored,
          goals_conceded,
          (goals_scored - goals_conceded) AS goal_difference,
          wins,
          draws,
          losses,
          clean_sheets,
          assists,
          motm_awards
        FROM realplayerstats
        WHERE season_id = ${seasonId}
        ORDER BY player_name
      `;
    }

    return NextResponse.json({ success: true, data: players, season_id: seasonId, isModern });
  } catch (error: any) {
    console.error('[season-players] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch players' }, { status: 500 });
  }
}
