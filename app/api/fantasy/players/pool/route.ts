import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/players/pool?league_id=xxx
 * Get all players in the fantasy pool for a league (for list management)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const league_id = searchParams.get('league_id');

    if (!league_id) {
      return NextResponse.json(
        { error: 'Missing league_id parameter' },
        { status: 400 }
      );
    }

    // Get all players for this league from postgres
    const players = await fantasySql`
      SELECT 
        real_player_id,
        player_name,
        real_team_name,
        position,
        category,
        star_rating,
        is_available
      FROM fantasy_players
      WHERE league_id = ${league_id}
      ORDER BY player_name ASC
    `;

    return NextResponse.json({ players });
  } catch (error: any) {
    console.error('Error fetching player pool:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player pool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
