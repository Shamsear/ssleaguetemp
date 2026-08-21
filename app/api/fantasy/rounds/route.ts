import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/rounds
 * 
 * Fetch all fantasy rounds for a specific league
 * 
 * Query Parameters:
 * - league_id: Required. The fantasy league ID
 * 
 * Returns:
 * - rounds: Array of round objects with round_id, round_number, round_name, is_completed, etc.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'league_id is required' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Fetch all rounds for this league, ordered by round_number
    const rounds = await sql`
      SELECT 
        fantasy_round_id,
        league_id,
        round_id,
        round_number,
        round_name,
        round_start_date,
        round_end_date,
        is_active,
        is_completed,
        points_calculated,
        created_at,
        updated_at
      FROM fantasy_rounds
      WHERE league_id = ${leagueId}
      ORDER BY round_number ASC
    `;

    return NextResponse.json({
      success: true,
      rounds: rounds,
      total: rounds.length
    });
  } catch (error: any) {
    console.error('Error fetching fantasy rounds:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch fantasy rounds',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
