/**
 * Script to create Red Panthers team document in Firestore
 * Run this to fix the "Team not found" error during season registration
 */

import { adminDb } from './lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

async function createRedPanthersTeam() {
  try {
    console.log('\n🔧 Creating Red Panthers Team Document...\n');

    // Team details
    const teamId = 'SSPSLT0003';
    const teamName = 'Red Panthers';
    
    // Get owner_uid from users collection if it exists
    console.log('🔍 Looking for Red Panthers user...');
    const usersQuery = await adminDb.collection('users')
      .where('teamName', '==', 'Red Panthers')
      .limit(1)
      .get();

    let ownerUid: string | undefined;
    let ownerEmail: string | undefined;
    let ownerUsername: string | undefined;
    let logoUrl: string | undefined;

    if (!usersQuery.empty) {
      const userData = usersQuery.docs[0].data();
      ownerUid = usersQuery.docs[0].id;
      ownerEmail = userData.email;
      ownerUsername = userData.username || userData.teamName;
      logoUrl = userData.logoUrl || userData.teamLogo;
      
      console.log(`✅ Found user: ${ownerUid} (${ownerUsername})`);
      
      // Update user with teamId if missing
      if (!userData.teamId || userData.teamId !== teamId) {
        console.log(`🔄 Updating user with teamId: ${teamId}`);
        await adminDb.collection('users').doc(ownerUid).update({
          teamId: teamId,
          updated_at: FieldValue.serverTimestamp(),
        });
        console.log(`✅ User updated with teamId`);
      }
    } else {
      console.log(`⚠️  No user found with teamName "Red Panthers"`);
      console.log(`   You'll need to provide the owner_uid manually or have the user complete signup first.`);
      
      // Prompt for owner UID
      console.log('\n   Please run this script with the owner UID:');
      console.log(`   Set ownerUid variable in the script to the correct user ID\n`);
      return;
    }

    // Check if team already exists
    const existingTeam = await adminDb.collection('teams').doc(teamId).get();
    
    if (existingTeam.exists) {
      console.log(`✅ Team ${teamId} already exists!`);
      console.log(JSON.stringify(existingTeam.data(), null, 2));
      
      // Update with owner_uid if missing
      const teamData = existingTeam.data()!;
      if (!teamData.owner_uid && ownerUid) {
        console.log(`🔄 Updating team with owner_uid: ${ownerUid}`);
        await adminDb.collection('teams').doc(teamId).update({
          owner_uid: ownerUid,
          updated_at: FieldValue.serverTimestamp(),
        });
        console.log(`✅ Team updated with owner_uid`);
      }
      
      return;
    }

    // Create team document
    console.log(`\n📝 Creating team document: ${teamId}`);
    
    const teamData = {
      team_id: teamId,
      team_name: teamName,
      team_code: teamId,
      owner_uid: ownerUid,
      owner_name: ownerUsername || teamName,
      email: ownerEmail || '',
      logo_url: logoUrl || null,
      teamLogo: logoUrl || null,
      seasons: [], // Will be populated when team registers for seasons
      current_season_id: null,
      total_seasons_participated: 0,
      fantasy_participating: false,
      is_active: true,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection('teams').doc(teamId).set(teamData);
    
    console.log(`✅ Team document created successfully!`);
    console.log(JSON.stringify(teamData, null, 2));
    
    console.log(`\n✅ Red Panthers (${teamId}) is now ready for season registration!`);

  } catch (error) {
    console.error('❌ Error creating team:', error);
  }
}

createRedPanthersTeam().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
});
