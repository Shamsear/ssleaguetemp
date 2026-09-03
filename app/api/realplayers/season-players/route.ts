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
      // S18+ — read from realplayerstats, fallback to adminDb if empty
      try {
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
      } catch (dbErr) {
        console.warn('[season-players] Neon query error, falling back to adminDb:', dbErr);
        players = [];
      }

      if (!players || players.length === 0) {
        try {
          const { adminDb } = await import('@/lib/neon/admin-db-wrapper');
          const snapshot = await adminDb.collection('realplayers').get();
          players = snapshot.docs.map((doc: any) => {
            const d = doc.data();
            return {
              id: doc.id,
              player_id: String(d.player_id || d.id || doc.id),
              player_name: d.name || d.player_name || 'Unknown Player',
              season_id: seasonId,
              team: d.team || d.team_name || 'Free Agent',
              team_id: d.team_id || '',
              category: d.category || d.category_name || 'Red',
              base_price: d.base_price || 0,
              price: d.price || 0,
              points: d.points || 0,
              matches_played: d.matches_played || 0,
              goals_scored: d.goals_scored || 0,
              goals_conceded: d.goals_conceded || 0,
              goal_difference: (d.goals_scored || 0) - (d.goals_conceded || 0),
              wins: d.wins || 0,
              draws: d.draws || 0,
              losses: d.losses || 0,
              clean_sheets: d.clean_sheets || 0,
              assists: d.assists || 0,
              motm_awards: d.motm_awards || 0,
            };
          });
        } catch (adminDbErr) {
          console.error('[season-players] adminDb fallback error:', adminDbErr);
          players = [];
        }
      }
    }

    return NextResponse.json({ success: true, data: players, season_id: seasonId, isModern });
  } catch (error: any) {
    console.error('[season-players] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch players' }, { status: 500 });
  }
}
