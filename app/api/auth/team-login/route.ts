import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Query teams collection for user with matching username (owner_name)
    const querySnapshot = await adminDb.collection('teams')
      .where('username', '==', username)
      .where('role', '==', 'team')
      .get();

    if (querySnapshot.empty) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    let authenticatedTeam: any = null;

    for (const docSnapshot of querySnapshot.docs) {
      const teamData = docSnapshot.data();
      const email = teamData.userEmail || teamData.email;
      
      if (!email) {
        console.log(`No email found for team ${username}, skipping auth check`);
        continue;
      }

      // Verify user document in adminDb
      if (teamData.uid || teamData.firebase_uid) {
        const uid = teamData.uid || teamData.firebase_uid;
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if ((userData as any)?.isActive === false) {
            return NextResponse.json(
              { success: false, error: 'Account is deactivated. Please contact support.' },
              { status: 403 }
            );
          }
          if ((userData as any)?.role === 'team' && (userData as any)?.isApproved === false) {
            return NextResponse.json(
              { success: false, error: 'Your account is pending approval from the super admin. Please wait for approval before logging in.' },
              { status: 403 }
            );
          }
        }
      }

      authenticatedTeam = {
        id: teamData.id,
        team_name: teamData.team_name,
        owner_name: teamData.owner_name,
        username: teamData.username,
        email: email,
        role: teamData.role,
        current_season_id: teamData.current_season_id,
        seasons: teamData.seasons || [],
        is_active: teamData.is_active,
        is_historical: teamData.is_historical || false,
        performance_history: teamData.performance_history || {}
      };
      break;
    }

    if (!authenticatedTeam) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      team: authenticatedTeam
    });

  } catch (error: any) {
    console.error('Team login error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to verify team authentication status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'Team ID is required' },
        { status: 400 }
      );
    }

    // Query team by ID
    const querySnapshot = await adminDb.collection('teams')
      .where('id', '==', teamId)
      .where('role', '==', 'team')
      .get();

    if (querySnapshot.empty) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    const teamDoc = querySnapshot.docs[0];
    const teamData = teamDoc.data();

    return NextResponse.json({
      success: true,
      team: {
        id: teamData.id,
        team_name: teamData.team_name,
        owner_name: teamData.owner_name,
        username: teamData.username,
        role: teamData.role,
        current_season_id: teamData.current_season_id,
        seasons: teamData.seasons || [],
        is_active: teamData.is_active,
        performance_history: teamData.performance_history || {}
      }
    });

  } catch (error: any) {
    console.error('Team verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Verification failed' },
      { status: 500 }
    );
  }
}