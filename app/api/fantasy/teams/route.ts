import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/teams?league_id=xxx
 * Fetch all fantasy teams in a league
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'league_id parameter is required' },
        { status: 400 }
      );
    }

    const teams = await fantasySql`
      SELECT 
        team_id,
        league_id,
        team_name,
        owner_name,
        owner_uid,
        budget_remaining,
        total_points,
        supported_team_id,
        supported_team_name,
        supported_team_price,
        created_at,
        updated_at
      FROM fantasy_teams
      WHERE league_id = ${leagueId}
      ORDER BY team_name ASC
    `;

    return NextResponse.json({
      success: true,
      league_id: leagueId,
      teams
    });
  } catch (error: any) {
    console.error('Error fetching fantasy teams:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fantasy teams', details: error.message },
      { status: 500 }
    );
  }
}
