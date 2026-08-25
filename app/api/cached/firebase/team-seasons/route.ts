import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * GET /api/cached/firebase/team-seasons
 * Returns team_seasons data with ISR caching
 * 
 * Query params:
 * - seasonId: Filter by season (optional)
 * - teamId: Filter by team (optional)
 * 
 * Cache: 60 seconds (teams update during matches)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');
    const teamId = searchParams.get('teamId');
    
    let query = adminDb.collection('team_seasons');
    
    if (seasonId) {
      query = query.where('season_id', '==', seasonId) as any;
    }
    
    if (teamId) {
      query = query.where('team_id', '==', teamId) as any;
    }
    
    const snapshot = await query.get();
    
    // Fetch base teams data to get logo positioning adjustments
    const teamsSnapshot = await adminDb.collection('teams').get();
    const teamsMap = new Map();
    teamsSnapshot.forEach(doc => {
      const data = doc.data();
      teamsMap.set(doc.id, {
        logo_position_x_circle: data.logo_position_x_circle,
        logo_position_y_circle: data.logo_position_y_circle,
        logo_scale_circle: data.logo_scale_circle,
        logo_position_x_square: data.logo_position_x_square,
        logo_position_y_square: data.logo_position_y_square,
        logo_scale_square: data.logo_scale_square,
      });
    });
    
    const teamSeasons = snapshot.docs.map(doc => {
      const data = doc.data() as any;
      const tId = data.team_id || doc.id.split('_')[0];
      const positioning = teamsMap.get(tId) || {};
      return {
        id: doc.id,
        ...data,
        ...positioning,
      };
    });
    
    console.log('[API team-seasons] Query results:', {
      seasonIdFilter: seasonId,
      teamIdFilter: teamId,
      totalResults: teamSeasons.length,
      sampleSeasonIds: teamSeasons.slice(0, 5).map((ts: any) => ({
        id: ts.id,
        season_id: ts.season_id,
        team_name: ts.team_name
      }))
    });
    
    return NextResponse.json(
      {
        success: true,
        data: teamSeasons,
        cached: true,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'CDN-Cache-Control': 'public, s-maxage=60',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=60',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching team_seasons:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch team seasons',
      },
      { status: 500 }
    );
  }
}

export const revalidate = 60; // Revalidate every 60 seconds
export const dynamic = 'force-static';
