import { NextRequest, NextResponse } from 'next/server';
import { neonGetActiveSeason, neonGetAllSeasons } from '@/lib/neon/seasons';
import { verifyAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/seasons/current
 * Returns the currently active season from Neon Main DB
 * For committee admins with assigned seasonId claim, returns their assigned season
 */
export async function GET(request: NextRequest) {
  try {
    // Try to get auth for committee admin overrides
    try {
      const auth = await verifyAuth(['admin', 'committee_admin'], request);
      if (auth.authenticated && auth.claims?.role === 'committee_admin' && auth.claims?.seasonId) {
        const seasonId = auth.claims.seasonId;
        return NextResponse.json({
          season: {
            id: seasonId,
            season_id: seasonId,
            name: seasonId.replace('SSPSLS', 'Season '),
            status: 'active',
          },
        });
      }
    } catch {
      // Continue to default logic
    }

    // 1. Get active season from Neon Main DB
    const activeSeason = await neonGetActiveSeason();

    if (activeSeason) {
      const seasonNum =
        activeSeason.season_number ||
        parseInt(activeSeason.id.replace(/\D/g, '')) ||
        0;

      return NextResponse.json({
        season: {
          id: activeSeason.id,
          season_id: activeSeason.id,
          name:
            activeSeason.name ||
            (seasonNum ? `Season ${seasonNum}` : activeSeason.id),
          status: activeSeason.status || 'active',
          is_active: true,
          isActive: true,
          created_at: activeSeason.created_at,
        },
      });
    }

    // 2. Fallback: most recent season from Neon Main DB
    const allSeasons = await neonGetAllSeasons();
    if (allSeasons.length > 0) {
      const latest = allSeasons[0];
      const seasonNum =
        latest.season_number ||
        parseInt(latest.id.replace(/\D/g, '')) ||
        0;

      return NextResponse.json({
        season: {
          id: latest.id,
          season_id: latest.id,
          name: latest.name || (seasonNum ? `Season ${seasonNum}` : latest.id),
          status: latest.status || 'completed',
          is_active: Boolean(latest.is_active),
          isActive: Boolean(latest.is_active),
          created_at: latest.created_at,
        },
      });
    }

    return NextResponse.json(
      { error: 'No seasons found in database' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error fetching current season:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current season', details: error.message },
      { status: 500 }
    );
  }
}
