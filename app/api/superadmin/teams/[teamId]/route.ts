import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * PATCH /api/superadmin/teams/[teamId]
 * Update team details (logo, name, etc.)
 * Super admin only
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    // Verify super admin auth
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({
        success: false,
        error: auth.error || 'Unauthorized',
      }, { status: 401 });
    }

    const { teamId } = await params;
    const body = await request.json();
    const { teamName, logoUrl } = body;

    if (!teamName && !logoUrl) {
      return NextResponse.json({
        success: false,
        error: 'At least one field (teamName or logoUrl) must be provided',
      }, { status: 400 });
    }

    console.log(`[Super Admin] Updating team ${teamId}:`, { teamName, logoUrl });

    // Update Firebase teams collection
    const teamRef = adminDb.collection('teams').doc(teamId);
    const teamDoc = await teamRef.get();

    if (!teamDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'Team not found',
      }, { status: 404 });
    }

    const updateData: any = {};
    if (teamName) updateData.name = teamName;
    if (teamName) updateData.team_name = teamName;
    if (logoUrl) updateData.logo_url = logoUrl;

    await teamRef.update(updateData);
    console.log('✅ Updated teams collection');

    // Get team data to find related records
    const teamData = teamDoc.data();
    const firebaseUid = teamData?.firebase_uid || teamData?.user_id;

    // Update Firebase users collection if firebase_uid exists
    if (firebaseUid && (teamName || logoUrl)) {
      try {
        const userRef = adminDb.collection('users').doc(firebaseUid);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
          const userUpdateData: any = {};
          if (teamName) userUpdateData.teamName = teamName;
          if (logoUrl) userUpdateData.logoUrl = logoUrl;
          
          await userRef.update(userUpdateData);
          console.log('✅ Updated users collection');
        }
      } catch (error) {
        console.error('⚠️ Error updating users collection:', error);
        // Don't fail the whole request if user update fails
      }
    }

    // Update all team_seasons records for this team
    if (teamName || logoUrl) {
      try {
        const teamSeasonsSnapshot = await adminDb
          .collection('team_seasons')
          .where('team_id', '==', teamId)
          .get();

        const updatePromises = teamSeasonsSnapshot.docs.map(async (doc) => {
          const seasonUpdateData: any = { updated_at: new Date() };
          if (teamName) seasonUpdateData.team_name = teamName;
          if (logoUrl) seasonUpdateData.team_logo = logoUrl;
          
          return doc.ref.update(seasonUpdateData);
        });

        await Promise.all(updatePromises);
        console.log(`✅ Updated ${teamSeasonsSnapshot.size} team_seasons records`);
      } catch (error) {
        console.error('⚠️ Error updating team_seasons:', error);
        // Don't fail the whole request if team_seasons update fails
      }
    }

    // Update Neon teams table
    if (teamName) {
      try {
        await sql`
          UPDATE teams 
          SET 
            name = ${teamName},
            updated_at = NOW()
          WHERE id = ${teamId}
        `;
        console.log('✅ Updated Neon teams table');
      } catch (error) {
        console.error('⚠️ Error updating Neon teams table:', error);
        // Don't fail the whole request if Neon update fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Team updated successfully',
      data: updateData,
    });
  } catch (error: any) {
    console.error('❌ Error updating team:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update team',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

/**
 * GET /api/superadmin/teams/[teamId]
 * Get team details
 * Super admin only
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    // Verify super admin auth
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({
        success: false,
        error: auth.error || 'Unauthorized',
      }, { status: 401 });
    }

    const { teamId } = await params;

    // Get team from Firebase
    const teamDoc = await adminDb.collection('teams').doc(teamId).get();

    if (!teamDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'Team not found',
      }, { status: 404 });
    }

    const teamData = {
      id: teamDoc.id,
      ...teamDoc.data(),
    };

    return NextResponse.json({
      success: true,
      data: teamData,
    });
  } catch (error: any) {
    console.error('❌ Error fetching team:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch team',
    }, { status: 500 });
  }
}
