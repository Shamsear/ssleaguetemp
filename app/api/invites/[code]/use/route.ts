import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/invites/[code]/use
 * Mark invite as used and record usage
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const { userId, username, email } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: 'Invite code is required' }, { status: 400 });
    }

    const inviteRef = adminDb.collection('invites').doc(code);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
    }

    const updates: any = {
      usedCount: FieldValue.increment(1),
    };
    if (userId) {
      updates.usedBy = FieldValue.arrayUnion(userId);
    }

    await inviteRef.update(updates);

    if (userId) {
      await adminDb.collection('inviteUsages').add({
        inviteId: code,
        inviteCode: code,
        userId,
        username: username || '',
        email: email || '',
        usedAt: FieldValue.serverTimestamp(),
      }).catch((e: any) => console.warn('Could not add to inviteUsages:', e.message));
    }

    return NextResponse.json({ success: true, message: 'Invite marked as used' });
  } catch (error: any) {
    console.error('Error marking invite as used:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to mark invite as used' },
      { status: 500 }
    );
  }
}
