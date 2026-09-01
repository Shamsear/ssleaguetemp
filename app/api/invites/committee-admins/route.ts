import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * GET /api/invites/committee-admins?seasonId=SSPSLS18
 * Fetch committee admins for a given season (super_admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const seasonId = request.nextUrl.searchParams.get('seasonId');

    if (!seasonId) {
      return NextResponse.json({ error: 'seasonId query param is required' }, { status: 400 });
    }

    const snapshot = await adminDb
      .collection('users')
      .where('role', '==', 'committee_admin')
      .where('seasonId', '==', seasonId)
      .get();

    const admins = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        username: data.username || '',
        email: data.email || '',
        isActive: data.isActive !== false,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt ?? null,
      };
    });

    return NextResponse.json({ success: true, admins });
  } catch (error: any) {
    console.error('Error fetching committee admins:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch committee admins' },
      { status: 500 }
    );
  }
}
