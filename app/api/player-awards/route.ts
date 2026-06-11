import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

// GET - List player awards for a season
// Combines both 'awards' and 'player_awards' tables for a comprehensive view
export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const searchParams = request.nextUrl.searchParams;
    const seasonId = searchParams.get('season_id');
    const playerId = searchParams.get('player_id');
    const awardCategory = searchParams.get('award_category'); // 'individual' or 'category'

    console.log(`[Player Awards API] Fetch parameters - seasonId: ${seasonId}, playerId: ${playerId}, awardCategory: ${awardCategory}`);

    let awards = [];

    if (playerId && seasonId) {
      console.log(`[Player Awards API] Querying specific player awards for playerId: ${playerId}, seasonId: ${seasonId} (Case-insensitive)`);
      
      const oldAwards = await sql`
        SELECT * FROM player_awards
        WHERE player_id = ${playerId} AND LOWER(season_id) = LOWER(${seasonId})
        ORDER BY created_at DESC
      `;
      console.log(`[Player Awards API] Legacy player_awards count: ${oldAwards.length}`);

      const newAwards = await sql`
        SELECT 
          id,
          award_type,
          season_id,
          round_number,
          week_number,
          player_id,
          player_name,
          team_id,
          team_name,
          performance_stats,
          notes,
          created_at,
          updated_at,
          -- Map fields to match player_awards structure
          award_type as award_category,
          'individual' as award_type_legacy,
          NULL as award_position,
          NULL as player_category,
          NULL as awarded_by
        FROM awards
        WHERE player_id = ${playerId} AND LOWER(season_id) = LOWER(${seasonId})
        ORDER BY created_at DESC
      `;
      console.log(`[Player Awards API] Modern awards count: ${newAwards.length}`);

      awards = [...oldAwards, ...newAwards];
    } else if (seasonId) {
      console.log(`[Player Awards API] Querying all awards for seasonId: ${seasonId} (Case-insensitive)`);

      const oldAwards = awardCategory 
        ? await sql`
            SELECT * FROM player_awards
            WHERE LOWER(season_id) = LOWER(${seasonId}) AND award_category = ${awardCategory}
            ORDER BY display_order ASC, award_category, award_type, award_position, created_at DESC
          `
        : await sql`
            SELECT * FROM player_awards
            WHERE LOWER(season_id) = LOWER(${seasonId})
            ORDER BY display_order ASC, award_category, award_type, award_position, created_at DESC
          `;
      console.log(`[Player Awards API] Legacy player_awards count for season: ${oldAwards.length}`);

      const newAwards = await sql`
        SELECT 
          id,
          award_type,
          season_id,
          round_number,
          week_number,
          player_id,
          player_name,
          team_id,
          team_name,
          performance_stats,
          notes,
          created_at,
          updated_at,
          award_type as award_category,
          'individual' as award_type_legacy
        FROM awards
        WHERE LOWER(season_id) = LOWER(${seasonId})
        ORDER BY award_type, created_at DESC
      `;
      console.log(`[Player Awards API] Modern awards count for season: ${newAwards.length}`);

      awards = [...oldAwards, ...newAwards];
    } else {
      console.log(`[Player Awards API] Querying all global awards`);

      const oldAwards = await sql`
        SELECT * FROM player_awards
        ORDER BY display_order ASC, created_at DESC
      `;
      const newAwards = await sql`
        SELECT 
          id,
          award_type as award_category,
          season_id,
          player_id,
          player_name,
          performance_stats,
          notes,
          created_at
        FROM awards
        ORDER BY created_at DESC
      `;
      awards = [...oldAwards, ...newAwards];
      console.log(`[Player Awards API] Global awards count - legacy: ${oldAwards.length}, modern: ${newAwards.length}`);
    }

    console.log(`[Player Awards API] Returning total combined awards: ${awards.length}`);
    return NextResponse.json({ success: true, awards });
  } catch (error: any) {
    console.error('[Player Awards API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch player awards' },
      { status: 500 }
    );
  }
}
