import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * POST /api/admin/registration-phases
 * DEPRECATED - Phase system removed. Only close_registration action is supported.
 * All registrations are now treated uniformly (no confirmed/unconfirmed distinction)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season_id, action } = body;

    if (!season_id || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: season_id and action' },
        { status: 400 }
      );
    }

    const seasonRef = adminDb.collection('seasons').doc(season_id);
    const seasonDoc = await seasonRef.get();

    if (!seasonDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Season not found' },
        { status: 404 }
      );
    }

    // Only support close_registration action - all other phase actions are deprecated
    if (action === 'close_registration') {
      await seasonRef.update({
        is_player_registration_open: false,
        updated_at: new Date(),
      });

      return NextResponse.json({
        success: true,
        message: 'Registration closed successfully',
      });
    }

    // All other actions are no-ops
    return NextResponse.json({
      success: true,
      message: 'Action ignored - phase system has been removed',
    });
  } catch (error: any) {
    console.error('Error managing registration:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to manage registration',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/registration-phases?season_id=XXX
 * Get registration statistics (simplified - no phase distinction)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season_id = searchParams.get('season_id');

    if (!season_id) {
      return NextResponse.json(
        { success: false, error: 'Missing season_id parameter' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();
    const seasonDoc = await adminDb.collection('seasons').doc(season_id).get();

    if (!seasonDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Season not found' },
        { status: 404 }
      );
    }

    const seasonData = seasonDoc.data()!;

    // Get total registration count (ignore registration_type)
    const totalCount = await sql`
      SELECT COUNT(*) as count
      FROM player_seasons
      WHERE season_id = ${season_id}
    `;

    const total = Number(totalCount[0]?.count || 0);

    return NextResponse.json({
      success: true,
      data: {
        // Simplified response - all registrations treated uniformly
        total_registrations: total,
        is_registration_open: seasonData.is_player_registration_open || false,
        
        // Legacy fields for backward compatibility (deprecated)
        registration_phase: 'open',
        confirmed_registrations: total,
        unconfirmed_registrations: 0,
        confirmed_slots_limit: 999,
        confirmed_slots_filled: total,
        unconfirmed_registration_enabled: false,
      },
    });
  } catch (error: any) {
    console.error('Error fetching registration status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch registration status',
      },
      { status: 500 }
    );
  }
}
