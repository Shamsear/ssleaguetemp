import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/current-season
 * Returns the active season (not completed) with basic info
 */
export async function GET() {
  try {
    // Import Firebase admin here to catch initialization errors
    let adminDb: any;
    try {
      const firebaseAdmin = await import('@/lib/firebase/admin');
      adminDb = firebaseAdmin.adminDb;
    } catch (firebaseError: any) {
      console.error('❌ Firebase initialization error:', firebaseError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Firebase initialization failed',
          details: firebaseError.message 
        },
        { status: 500 }
      );
    }

    console.log('🔍 Fetching active season from Firebase...');
    
    // Get the first active season (status != 'completed')
    const seasonsSnapshot = await adminDb
      .collection('seasons')
      .where('status', '!=', 'completed')
      .orderBy('status')
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
    
    if (seasonsSnapshot.empty) {
      // No active season, get the most recent completed season
      console.log('⚠️ No active season, fetching most recent...');
      const recentSeasonSnapshot = await adminDb
        .collection('seasons')
        .where('is_historical', '==', false)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
      
      if (recentSeasonSnapshot.empty) {
        return NextResponse.json({
          success: false,
          message: 'No seasons found'
        }, { status: 404 });
      }
      
      const seasonDoc = recentSeasonSnapshot.docs[0];
      const seasonData = { id: seasonDoc.id, ...seasonDoc.data() } as any;
      
      // Generate name from ID if missing
      if (!seasonData.name && seasonDoc.id) {
        const seasonNum = seasonDoc.id.match(/\d+/);
        if (seasonNum) {
          seasonData.name = `Season ${seasonNum[0]}`;
        } else {
          seasonData.name = seasonDoc.id;
        }
      }
      
      return NextResponse.json({
        success: true,
        data: seasonData,
        isActive: false
      });
    }
    
    const seasonDoc = seasonsSnapshot.docs[0];
    const seasonData = { id: seasonDoc.id, ...seasonDoc.data() } as any;
    
    // Generate name from ID if missing
    if (!seasonData.name && seasonDoc.id) {
      const seasonNum = seasonDoc.id.match(/\d+/);
      if (seasonNum) {
        seasonData.name = `Season ${seasonNum[0]}`;
      } else {
        seasonData.name = seasonDoc.id;
      }
    }
    
    console.log(`✅ Found active season: ${seasonData.name} (${seasonDoc.id})`);
    
    return NextResponse.json({
      success: true,
      data: seasonData,
      isActive: true
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching current season:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch current season',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
