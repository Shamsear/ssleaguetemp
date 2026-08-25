import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getMainDb } from '@/lib/neon/main-config';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const userId = auth.userId!;
    const sql = getMainDb();

    // Step 1: Get active season
    const seasons = await sql`SELECT id, name FROM seasons WHERE is_active = true ORDER BY created_at DESC LIMIT 1`;

    if (!seasons || seasons.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          hasActiveSeason: false,
          isRegistered: false,
        },
      });
    }

    const activeSeason = seasons[0];

    // Step 2: Check if this user is registered for the active season
    const teamSeasons = await sql`SELECT id, team_id, team_name, status, user_id FROM team_seasons WHERE season_id = ${activeSeason.id} AND user_id = ${userId} LIMIT 1`;

    const teamSeason = teamSeasons?.[0];
    const isRegistered = teamSeason?.status === 'registered';

    // Step 3: Get team info if registered
    let teamDocId = teamSeason?.team_id || null;
    let teamLogo = null;

    if (teamDocId) {
      const teams = await sql`SELECT logo_url FROM teams WHERE id = ${teamDocId} LIMIT 1`;
      teamLogo = teams?.[0]?.logo_url || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        hasActiveSeason: true,
        isRegistered,
        seasonId: activeSeason.id,
        seasonName: activeSeason.name,
        teamDocId,
        teamLogo,
      },
    });
  } catch (error: any) {
    console.error('Error checking registration status:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
