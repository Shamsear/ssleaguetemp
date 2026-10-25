import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * GET /api/invites/[code]
 * Validate and retrieve invite details by code
 * Publicly accessible (used by /register page)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Invite code is required' }, { status: 400 });
    }

    const inviteDoc = await adminDb.collection('invites').doc(code).get();

    if (!inviteDoc.exists) {
      return NextResponse.json({ valid: false, error: 'Invalid invite code' }, { status: 404 });
    }

    const data = inviteDoc.data();
    if (!data || !data.isActive) {
      return NextResponse.json({ valid: false, error: 'This invite has been deactivated' }, { status: 400 });
    }

    if (data.usedCount >= data.maxUses) {
      return NextResponse.json({ valid: false, error: 'This invite has reached its maximum uses' }, { status: 400 });
    }

    const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
    if (new Date() > expiresAt) {
      return NextResponse.json({ valid: false, error: 'This invite has expired' }, { status: 400 });
    }

    // Verify season exists in Neon or fallback to invite metadata
    let seasonName = data.seasonName || '';
    let seasonYear = data.seasonYear || '';

    if (data.seasonId) {
      try {
        const { getMainDb } = await import('@/lib/neon/main-config');
        const mainSql = getMainDb();
        const seasons = await mainSql`SELECT id, name, year FROM seasons WHERE id = ${data.seasonId} LIMIT 1`;
        if (seasons.length > 0) {
          seasonName = seasonName || seasons[0].name || seasons[0].id;
          seasonYear = seasonYear || seasons[0].year || '';
        }
      } catch (seasonErr) {
        console.warn('Could not query season in Neon, using invite metadata:', seasonErr);
      }
    }

    const invite = {
      id: inviteDoc.id,
      code: data.code || inviteDoc.id,
      description: data.description || '',
      seasonId: data.seasonId,
      seasonName: seasonName || (data.seasonId ? `Season ${data.seasonId.replace(/\D/g, '')}` : 'Season'),
      seasonYear: seasonYear || `${new Date().getFullYear()}`,
      maxUses: data.maxUses ?? 1,
      usedCount: data.usedCount ?? 0,
      expiresAt: expiresAt.toISOString(),
      createdAt: (data.createdAt?.toDate?.() || new Date(data.createdAt || Date.now())).toISOString(),
      createdBy: data.createdBy || '',
      createdByUsername: data.createdByUsername || 'superadmin',
      isActive: Boolean(data.isActive),
      usedBy: data.usedBy || [],
      type: data.type || 'committee_admin',
    };

    return NextResponse.json({ valid: true, invite });
  } catch (error: any) {
    console.error('Error validating invite code:', error);
    return NextResponse.json(
      { valid: false, error: error.message || 'Failed to validate invite code' },
      { status: 500 }
    );
  }
}

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
