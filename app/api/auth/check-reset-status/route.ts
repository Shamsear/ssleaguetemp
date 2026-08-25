import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * GET /api/auth/check-reset-status?username=xxx
 * Lets a user check if their password reset request has been approved.
 * Returns status + token (if approved) so they can reset directly without a link.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username')?.toLowerCase().trim();

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    // Resolve username → userId
    const usernameDoc = await adminDb.collection('usernames').doc(username).get();
    if (!usernameDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'No account found with this username' },
        { status: 404 }
      );
    }
    const userId = usernameDoc.data()?.uid;

    // Find the most recent non-completed request for this user
    const snapshot = await adminDb
      .collection('passwordResetRequests')
      .where('userId', '==', userId)
      .orderBy('requestedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        found: false,
        message: 'No password reset request found for this username',
      });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    const status = data.status as 'pending' | 'approved' | 'rejected' | 'completed';

    // Build response — only expose token if approved and not expired
    const response: Record<string, any> = {
      success: true,
      found: true,
      requestId: doc.id,
      status,
      username: data.username,
      requestedAt: data.requestedAt?.toDate?.()?.toISOString() || null,
      reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() || null,
      adminNotes: data.adminNotes || null,
    };

    if (status === 'approved') {
      // Check expiry
      const expiresAt = data.resetLinkExpiresAt?.toDate?.();
      if (expiresAt && expiresAt < new Date()) {
        response.status = 'expired';
        response.token = null;
        response.message = 'Your reset approval has expired. Please submit a new request.';
      } else {
        response.token = data.resetToken || null;
        response.expiresAt = expiresAt?.toISOString() || null;
        response.message = 'Your request has been approved! You can now set a new password below.';
      }
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error checking reset status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check request status' },
      { status: 500 }
    );
  }
}
