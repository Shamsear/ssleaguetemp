import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { formatId, ID_PREFIXES, ID_PADDING } from '@/lib/id-utils';

/**
 * Admin endpoint to directly create a team account (User + Team document)
 * POST /api/admin/create-team
 */
export async function POST(request: NextRequest) {
  try {
    const { teamName, ownerName, managerName, username, email, password } = await request.json();

    if (!teamName || !username || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Team name, username, email, and password are required' },
        { status: 400 }
      );
    }

    // 1. Check if username is available in Firestore
    const usernameRef = adminDb.collection('usernames').doc(username.trim().toLowerCase());
    const usernameSnap = await usernameRef.get();
    if (usernameSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Username is already taken' },
        { status: 400 }
      );
    }

    // 2. Create Firebase Auth user
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email: email.trim(),
        password: password,
        displayName: teamName.trim(),
      });
    } catch (authError: any) {
      console.error('Firebase Auth creation failed:', authError);
      return NextResponse.json(
        { success: false, error: authError.message || 'Failed to create user account' },
        { status: 400 }
      );
    }

    const uid = userRecord.uid;

    // 3. Generate a robust and unique team ID
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
    const { FieldValue } = await import('firebase-admin/firestore');

    // 4. Batch write: Reserve username, Create User Doc, Create Team Doc
    const batch = adminDb.batch();

    // Reserve username
    batch.set(usernameRef, {
      uid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Create User document
    const userRef = adminDb.collection('users').doc(uid);
    batch.set(userRef, {
      uid,
      email: email.trim(),
      username: username.trim().toLowerCase(),
      role: 'team',
      isActive: true,
      isApproved: true, // Created by admin, auto-approved
      teamName: teamName.trim(),
      ownerName: ownerName.trim(),
      managerName: managerName.trim(),
      teamId: teamId,
      players: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create Team document
    const teamRef = adminDb.collection('teams').doc(teamId);
    batch.set(teamRef, {
      id: teamId,
      team_name: teamName.trim(),
      owner_name: ownerName.trim(),
      manager_name: managerName.trim() || '',
      uid: uid,
      userId: uid,
      owner_uid: uid,
      userEmail: email.trim(),
      email: email.trim(),
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
      created_at: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`✅ Direct team creation successful for ${teamId} (${teamName})`);

    // 5. Set user custom claims
    try {
      await adminAuth.setCustomUserClaims(uid, { role: 'team' });
      console.log(`✅ Set role=team custom claims for user: ${uid}`);
    } catch (claimsError) {
      console.error('Failed to set claims for direct team user:', claimsError);
    }

    return NextResponse.json({
      success: true,
      teamId,
      uid,
    });
  } catch (error: any) {
    console.error('Error directly creating team:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create team account' },
      { status: 500 }
    );
  }
}
