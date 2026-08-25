import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * One-time fix for Red Panthers team registration issue
 * Updates owner_uid to match the actual userId
 */
export async function POST(request: NextRequest) {
  try {
    const teamId = 'SSPSLT0003';
    const correctUserId = 'DLCem9bSBvepJ07YQnfnzdRwOBq1';

    console.log(`🔧 Fixing Red Panthers team document...`);

    // Update team document with correct owner_uid
    await adminDb.collection('teams').doc(teamId).update({
      owner_uid: correctUserId,
      updated_at: new Date(),
    });

    console.log(`✅ Updated team ${teamId} with owner_uid: ${correctUserId}`);

    // Also ensure user document has teamId field
    await adminDb.collection('users').doc(correctUserId).update({
      teamId: teamId,
      updated_at: new Date(),
    });

    console.log(`✅ Updated user ${correctUserId} with teamId: ${teamId}`);

    return NextResponse.json({
      success: true,
      message: 'Red Panthers team fixed successfully',
      data: {
        teamId: teamId,
        owner_uid: correctUserId,
      }
    });

  } catch (error: any) {
    console.error('❌ Error fixing team:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fix team',
    }, { status: 500 });
  }
}
