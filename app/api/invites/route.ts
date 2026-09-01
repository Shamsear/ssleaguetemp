import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';

// Generate random invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
    if ((i + 1) % 4 === 0 && i !== 11) {
      code += '-';
    }
  }
  return code;
}

/**
 * GET /api/invites
 * Fetch all admin invites (super_admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await adminDb
      .collection('invites')
      .orderBy('createdAt', 'desc')
      .get();

    const invites = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? data.expiresAt,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt,
      };
    });

    return NextResponse.json({ success: true, invites });
  } catch (error: any) {
    console.error('Error fetching invites:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch invites' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invites
 * Create a new admin invite (super_admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { seasonId, description, maxUses, expiresInHours, type, createdBy, createdByUsername } = body;

    if (!seasonId) {
      return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
    }

    // Get season details from Firestore (or Neon via API — here we use Firebase admin directly)
    // Check active invite count
    const existingSnapshot = await adminDb
      .collection('invites')
      .where('seasonId', '==', seasonId)
      .get();

    const activeInvites = existingSnapshot.docs.filter((doc) => {
      const d = doc.data();
      return d.isActive && d.usedCount < d.maxUses;
    });

    if (activeInvites.length >= 10) {
      return NextResponse.json(
        { error: 'Maximum active invites (10) reached for this season.' },
        { status: 400 }
      );
    }

    // Generate a unique code
    let code = generateInviteCode();
    let isUnique = false;
    while (!isUnique) {
      const existing = await adminDb.collection('invites').doc(code).get();
      if (!existing.exists) {
        isUnique = true;
      } else {
        code = generateInviteCode();
      }
    }

    // Compute expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (expiresInHours || 24));

    const now = new Date();

    const newInvite = {
      code,
      description: description || '',
      seasonId,
      maxUses: maxUses || 1,
      usedCount: 0,
      expiresAt,
      createdAt: now,
      createdBy: createdBy || auth.uid,
      createdByUsername: createdByUsername || '',
      isActive: true,
      usedBy: [],
      type: type || 'committee_admin',
    };

    await adminDb.collection('invites').doc(code).set(newInvite);

    return NextResponse.json({
      success: true,
      invite: {
        ...newInvite,
        id: code,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error creating invite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create invite' },
      { status: 500 }
    );
  }
}
