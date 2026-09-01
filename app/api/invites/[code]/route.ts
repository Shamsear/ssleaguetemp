import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * DELETE /api/invites/[code]
 * Delete (revoke) an invite by its code (super_admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await params;

    if (!code) {
      return NextResponse.json({ error: 'Invite code is required' }, { status: 400 });
    }

    const inviteRef = adminDb.collection('invites').doc(code);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    await inviteRef.delete();

    return NextResponse.json({ success: true, message: 'Invite deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting invite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete invite' },
      { status: 500 }
    );
  }
}
