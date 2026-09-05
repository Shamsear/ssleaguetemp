import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * GET /api/seasons/current
 * Returns the currently active season
 * For committee admins, returns their assigned season
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();

    // Try to get auth, but don't fail if not authenticated (allow public access)
    try {
      const auth = await verifyAuth(['admin', 'committee_admin', 'committee_admin'], request);
      
      console.log('[Current Season API] Auth result:', {
        authenticated: auth.authenticated,
        role: auth.claims?.role,
        seasonId: auth.claims?.seasonId,
        uid: auth.uid
      });
      
      // If committee admin, return their assigned season
      if (auth.authenticated && auth.claims?.role === 'committee_admin' && auth.claims?.seasonId) {
        const seasonId = auth.claims.seasonId;
        console.log('[Current Season API] Committee admin detected, using their season:', seasonId);
        
        return NextResponse.json({
          season: {
            id: seasonId,
            season_id: seasonId,
            name: seasonId.replace('SSPSLS', 'Season '),
            status: 'active',
          }
        });
      }
    } catch (authError) {
      console.log('[Current Season API] Auth check failed or not authenticated:', authError);
      // Continue to default logic
    }

    // For other users, get the most recent active season
    const result = await sql`
      SELECT 
        season_id,
        MAX(created_at) as created_at,
        MAX(status) as status
      FROM tournaments
      WHERE status = 'active'
      GROUP BY season_id
      ORDER BY season_id DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      // If no active season, get the most recent season
      const latestResult = await sql`
        SELECT 
          season_id,
          MAX(created_at) as created_at,
          MAX(status) as status
        FROM tournaments
        GROUP BY season_id
        ORDER BY season_id DESC
        LIMIT 1
      `;

      if (latestResult.length === 0) {
        return NextResponse.json(
          { error: 'No seasons found' },
          { status: 404 }
        );
      }

      const season = latestResult[0];
      return NextResponse.json({
        season: {
          id: season.season_id,
          season_id: season.season_id,
          name: season.season_id.replace('SSPSLS', 'Season '),
          status: season.status || 'completed',
          created_at: season.created_at,
        }
      });
    }

    const season = result[0];
    return NextResponse.json({
      season: {
        id: season.season_id,
        season_id: season.season_id,
        name: season.season_id.replace('SSPSLS', 'Season '),
        status: season.status,
        created_at: season.created_at,
      }
    });
  } catch (error: any) {
    console.error('Error fetching current season:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current season' },
      { status: 500 }
    );
  }
}
