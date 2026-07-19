import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

/**
 * Register a committee admin by setting custom claims
 * POST /api/auth/register-admin
 */
export async function POST(request: NextRequest) {
  try {
    const { uid, inviteCode } = await request.json();

    if (!uid || !inviteCode) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 1. Fetch user document from Firestore users/{uid}
    const userDocRef = adminDb.collection('users').doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'User document not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    if (!userData || userData.role !== 'committee_admin') {
      return NextResponse.json(
        { success: false, error: 'User is not registered as a committee admin' },
        { status: 400 }
      );
    }

    // 2. Fetch and validate the invite code to ensure it's valid/active and matches the user's season
    const inviteDoc = await adminDb.collection('invites').doc(inviteCode).get();
    if (!inviteDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Invalid invite code' },
        { status: 400 }
      );
    }

    const inviteData = inviteDoc.data();
    if (!inviteData || !inviteData.isActive) {
      return NextResponse.json(
        { success: false, error: 'Invite code is inactive' },
        { status: 400 }
      );
    }

    const seasonId = inviteData.seasonId;
    if (!seasonId || seasonId !== userData.seasonId) {
      return NextResponse.json(
        { success: false, error: 'Invite season does not match user season' },
        { status: 400 }
      );
    }

    // 3. Get current custom claims and merge them
    const user = await adminAuth.getUser(uid);
    const currentClaims = user.customClaims || {};

    // 4. Set custom claims with both role and seasonId
    await adminAuth.setCustomUserClaims(uid, {
      ...currentClaims,
      role: 'committee_admin',
      seasonId: seasonId,
    });

    console.log(`✅ Custom claims set for newly registered admin ${uid}: role=committee_admin, seasonId=${seasonId}`);

    return NextResponse.json({
      success: true,
      message: 'Admin custom claims set successfully',
    });
  } catch (error: any) {
    console.error('Error setting admin custom claims:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to set admin custom claims' },
      { status: 500 }
    );
  }
}
