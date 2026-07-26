import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { formatId, ID_PREFIXES, ID_PADDING } from '@/lib/id-utils';

/**
 * Create a team document in Firestore teams collection
 * POST /api/teams/create
 */
export async function POST(request: NextRequest) {
  try {
    const { uid, email, username, teamName, ownerName, managerName } = await request.json();

    if (!uid || !email || !username) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate a robust and unique team ID
    const teamsSnapshot = await adminDb.collection('teams').get();
    let maxCounter = 0;
    
    teamsSnapshot.forEach((doc) => {
      const id = doc.id;
      // Extract numeric part from ID (e.g., SSPSLT0012 or team0012)
      const numericPart = id.replace(/\D/g, '');
      if (numericPart) {
        const counter = parseInt(numericPart, 10);
        if (!isNaN(counter) && counter > maxCounter) {
          maxCounter = counter;
        }
      }
    });
    
    let nextCounter = maxCounter + 1;
    let teamId = formatId(ID_PREFIXES.TEAM, nextCounter, ID_PADDING.TEAM);
    
    // Safety check: ensure document does not exist (prevent overwriting existing team data)
    let docExists = true;
    while (docExists) {
      const docSnap = await adminDb.collection('teams').doc(teamId).get();
      if (docSnap.exists) {
        nextCounter++;
        teamId = formatId(ID_PREFIXES.TEAM, nextCounter, ID_PADDING.TEAM);
      } else {
        docExists = false;
      }
    }
    console.log(`✅ Generated team ID: ${teamId} for ${username}`);

    // Create team document using Admin SDK
    const { FieldValue } = await import('firebase-admin/firestore');
    
    await adminDb.collection('teams').doc(teamId).set({
      id: teamId,
      team_name: teamName || username,
      owner_name: ownerName || username,
      uid: uid,
      userId: uid,
      owner_uid: uid,
      userEmail: email,
      email: email,
      role: 'team',
      is_active: true,
      seasons: [],
      current_season_id: '',
      performance_history: {},
      hasUserAccount: true,
      is_historical: false,
      total_seasons_participated: 0,
      fantasy_participating: false,
      fantasy_joined_at: null,
      manager_name: managerName || '',
      created_at: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Team document created: ${teamId}`);

    // CRITICAL: Update user document with teamId so season registration can find the team
    try {
      await adminDb.collection('users').doc(uid).update({
        teamId: teamId,
        updated_at: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`✅ User document updated with teamId: ${teamId}`);
    } catch (userUpdateError) {
      console.error('Error updating user document with teamId:', userUpdateError);
      // This is critical but we'll log and continue
    }

    // Set custom claims for the user (enables role-based auth without DB reads)
    try {
      const user = await adminAuth.getUser(uid);
      const currentClaims = user.customClaims || {};
      
      await adminAuth.setCustomUserClaims(uid, {
        ...currentClaims,
        role: 'team',
      });
      
      console.log(`✅ Custom claims set for user ${uid}: role=team`);
    } catch (claimsError) {
      console.error('Error setting custom claims:', claimsError);
      // Don't fail the request if claims fail - can be set later
    }

    return NextResponse.json({
      success: true,
      teamId,
    });
  } catch (error: any) {
    console.error('Error creating team document:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create team document',
      },
      { status: 500 }
    );
  }
}
