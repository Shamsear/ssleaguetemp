import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { FieldValue } from 'firebase-admin/firestore';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: seasonId } = await params;
    
    // Get current season data
    const seasonRef = adminDb.collection('seasons').doc(seasonId);
    const seasonDoc = await seasonRef.get();
    
    if (!seasonDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: 'Season not found',
        },
        { status: 404 }
      );
    }
    
    const seasonData = seasonDoc.data()!;
    const currentStatus = Boolean(
      seasonData.is_player_registration_open ??
      seasonData.registration_open ??
      seasonData.registrationOpen ??
      (typeof seasonData.raw_data === 'object' && seasonData.raw_data ? seasonData.raw_data.is_player_registration_open : undefined) ??
      false
    );
    const newStatus = !currentStatus;
    
    // Update the status in Firestore / adminDb wrapper
    await seasonRef.update({
      is_player_registration_open: newStatus,
      registrationOpen: newStatus,
      registration_open: newStatus,
      updated_at: FieldValue.serverTimestamp(),
    });
    
    // Update Neon Main DB
    if (isMainDbAvailable()) {
      try {
        const sql = getMainDb();
        await sql`
          UPDATE seasons
          SET registration_open = ${newStatus},
              raw_data = COALESCE(raw_data, '{}'::jsonb) || ${JSON.stringify({ is_player_registration_open: newStatus, registrationOpen: newStatus, registration_open: newStatus })}::jsonb,
              updated_at = NOW()
          WHERE id = ${seasonId}
        `;
      } catch (neonErr: any) {
        console.warn('Neon season registration toggle warning:', neonErr.message);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Player registration ${newStatus ? 'opened' : 'closed'} successfully`,
      season: {
        id: seasonId,
        name: seasonData.name,
        is_player_registration_open: newStatus,
        registration_open: newStatus,
        registrationOpen: newStatus,
      },
    });
    
  } catch (error: any) {
    console.error('Error toggling player registration:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// GET to check current status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: seasonId } = await params;
    
    const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
    
    if (!seasonDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: 'Season not found',
        },
        { status: 404 }
      );
    }
    
    const seasonData = seasonDoc.data()!;
    const isOpen = Boolean(
      seasonData.is_player_registration_open ??
      seasonData.registration_open ??
      seasonData.registrationOpen ??
      (typeof seasonData.raw_data === 'object' && seasonData.raw_data ? seasonData.raw_data.is_player_registration_open : undefined) ??
      false
    );
    
    return NextResponse.json({
      success: true,
      season: {
        id: seasonId,
        name: seasonData.name,
        is_player_registration_open: isOpen,
        registration_open: isOpen,
        registrationOpen: isOpen,
      },
    });
    
  } catch (error: any) {
    console.error('Error checking player registration status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
