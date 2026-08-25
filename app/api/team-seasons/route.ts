import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * GET /api/team-seasons
 * Fetch team_season data for a user in a specific season
 * Query params:
 * - user_id: Firebase user UID
 * - season_id: Season ID
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');
    const seasonId = searchParams.get('season_id');

    // If only season_id is provided, return ALL team seasons for that season
    if (seasonId && !userId) {
      const { getMainDb } = await import('@/lib/neon/main-config');
      const sql = getMainDb();
      const rows = await sql`SELECT * FROM team_seasons WHERE season_id = ${seasonId} ORDER BY team_name ASC`;
      return NextResponse.json({ success: true, data: rows });
    }

    if (!userId || !seasonId) {
      return NextResponse.json(
        { success: false, error: 'user_id and season_id are required' },
        { status: 400 }
      );
    }

    // Single user lookup via wrapper
    const teamSeasonsQuery = await adminDb
      .collection('team_seasons')
      .where('user_id', '==', userId)
      .where('season_id', '==', seasonId)
      .where('status', '==', 'registered')
      .limit(1)
      .get();

    if (teamSeasonsQuery.empty) {
      return NextResponse.json(
        { success: false, error: 'No team registration found for this season' },
        { status: 404 }
      );
    }

    const teamSeasonDoc = teamSeasonsQuery.docs[0];
    const teamSeasonData = teamSeasonDoc.data();

    return NextResponse.json({
      success: true,
      team_season: {
        id: teamSeasonDoc.id,
        ...teamSeasonData,
      },
    });
  } catch (error: any) {
    console.error('Error fetching team_season:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch team season' },
      { status: 500 }
    );
  }
}
