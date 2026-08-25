import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';
import { verifyAuth } from '@/lib/auth-helper';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json({
        success: false,
        error: auth.error || 'Unauthorized',
      }, { status: 401 });
    }

    const userId = auth.userId!;
    const sql = getMainDb();

    // Check if user is registered for any season
    const teamSeasons = await sql`SELECT * FROM team_seasons WHERE team_id = ${userId} AND status = 'registered' LIMIT 1`;
    
    if (teamSeasons.length > 0) {
      const teamSeasonData = teamSeasons[0];
      const seasonId = teamSeasonData.season_id;
      
      const seasonRows = await sql`SELECT * FROM seasons WHERE id = ${seasonId} LIMIT 1`;
      if (seasonRows.length === 0) {
        return NextResponse.json({
          success: false,
          data: { hasActiveSeason: false, isRegistered: false },
        });
      }

      const seasonData = seasonRows[0];
      return NextResponse.json({
        success: true,
        data: {
          isRegistered: true,
          teamSeasonId: teamSeasonData.id,
          seasonId: seasonData.id,
          seasonName: seasonData.name,
          teamId: teamSeasonData.team_id,
          status: teamSeasonData.status,
        },
      });
    }

    // Not registered - check for active season
    const activeSeasons = await sql`SELECT * FROM seasons WHERE is_active = true LIMIT 1`;
    if (activeSeasons.length > 0) {
      return NextResponse.json({
        success: false,
        data: {
          hasActiveSeason: true,
          isRegistered: false,
          seasonName: activeSeasons[0].name,
          seasonId: activeSeasons[0].id,
        },
      });
    }

    return NextResponse.json({
      success: false,
      data: { hasActiveSeason: false, isRegistered: false },
    });
  } catch (error: any) {
    console.error('Error checking team season status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check status' },
      { status: 500 }
    );
  }
}
