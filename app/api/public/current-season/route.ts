import { NextResponse } from 'next/server';
import { neonGetActiveSeason, neonGetAllSeasons } from '@/lib/neon/seasons';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/current-season
 * Returns the active season from Neon Main DB
 */
export async function GET() {
  try {
    const activeSeason = await neonGetActiveSeason();

    if (activeSeason) {
      const seasonNum =
        activeSeason.season_number ||
        parseInt(activeSeason.id.replace(/\D/g, '')) ||
        0;

      const seasonData = {
        ...activeSeason,
        id: activeSeason.id,
        name:
          activeSeason.name ||
          (seasonNum ? `Season ${seasonNum}` : activeSeason.id),
        status: activeSeason.status || 'active',
        isActive: Boolean(activeSeason.is_active),
        is_active: Boolean(activeSeason.is_active),
      };

      return NextResponse.json({
        success: true,
        data: seasonData,
        isActive: true,
      });
    }

    // Fallback: If no active season is flagged, get the most recent season from Neon
    const allSeasons = await neonGetAllSeasons();
    if (allSeasons.length > 0) {
      const latest = allSeasons[0];
      const seasonNum =
        latest.season_number ||
        parseInt(latest.id.replace(/\D/g, '')) ||
        0;

      const seasonData = {
        ...latest,
        id: latest.id,
        name: latest.name || (seasonNum ? `Season ${seasonNum}` : latest.id),
        status: latest.status || 'completed',
        isActive: Boolean(latest.is_active),
        is_active: Boolean(latest.is_active),
      };

      return NextResponse.json({
        success: true,
        data: seasonData,
        isActive: false,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: 'No seasons found in database',
      },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('❌ Error fetching current season from Neon:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch current season',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
