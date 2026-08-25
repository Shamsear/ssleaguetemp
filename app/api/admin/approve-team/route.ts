import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

/**
 * POST /api/admin/approve-team
 * Approve a team by owner uid
 */
export async function POST(request: NextRequest) {
  try {
    const { uid, approvedBy } = await request.json();
    const sql = getMainDb();

    // Find team by owner_uid
    const teams = await sql`SELECT id FROM teams WHERE owner_uid = ${uid} LIMIT 1`;
    if (teams.length === 0) {
      return NextResponse.json({ success: false, message: 'No team found for this user' });
    }

    const teamId = teams[0].id;
    await sql`UPDATE teams SET is_approved = true, approved_by = ${approvedBy}, approved_at = NOW(), updated_at = NOW() WHERE id = ${teamId}`;
    console.log(`✅ Team ${teamId} approved by ${approvedBy}`);

    return NextResponse.json({ success: true, teamId });
  } catch (error: any) {
    console.error('Error approving team:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
