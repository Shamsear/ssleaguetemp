/**
 * Script to check all users and their roles
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { adminAuth, adminDb } from './lib/firebase/admin';

async function checkAllUsers() {
  console.log('\n🔍 Checking all users in the system...\n');

  try {
    // Get all users from Firebase Auth
    const listUsersResult = await adminAuth.listUsers(1000);
    
    console.log(`📊 Found ${listUsersResult.users.length} users\n`);
    console.log('═'.repeat(120));

    for (const userRecord of listUsersResult.users) {
      const uid = userRecord.uid;
      const email = userRecord.email || 'No email';
      const displayName = userRecord.displayName || 'No name';
      
      // Get Firestore data
      let firestoreData: any = {};
      try {
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (userDoc.exists) {
          firestoreData = userDoc.data() || {};
        }
      } catch (err) {
        console.error(`   ⚠️  Could not fetch Firestore data for ${email}`);
      }

      // Get custom claims from JWT
      const customClaims = userRecord.customClaims || {};

      // Determine role display
      const jwtRole = customClaims.role || 'NOT SET';
      const dbRole = firestoreData.role || 'NOT SET';
      const roleMatch = jwtRole === dbRole;
      
      // Display user info
      console.log(`\n👤 ${email}`);
      console.log(`   UID:          ${uid}`);
      console.log(`   Display Name: ${displayName}`);
      console.log(`   ─────────────────────────────────────────────`);
      console.log(`   JWT Role:     ${jwtRole} ${jwtRole === 'committee_admin' ? '✅' : jwtRole === 'super_admin' ? '👑' : jwtRole === 'team' ? '🏆' : '⚠️'}`);
      console.log(`   DB Role:      ${dbRole} ${!roleMatch ? '❌ MISMATCH!' : '✅'}`);
      
      if (customClaims.seasonId || firestoreData.seasonId) {
        console.log(`   JWT Season:   ${customClaims.seasonId || 'NOT SET'}`);
        console.log(`   DB Season:    ${firestoreData.seasonId || 'NOT SET'}`);
      }
      
      if (firestoreData.teamId) {
        console.log(`   Team ID:      ${firestoreData.teamId}`);
      }

      // Highlight issues
      if (!roleMatch) {
        console.log(`   ⚠️  WARNING: Role mismatch between JWT and Database!`);
      }
      if (jwtRole === 'NOT SET' && dbRole === 'NOT SET') {
        console.log(`   ⚠️  WARNING: No role assigned to this user!`);
      }
      
      console.log('═'.repeat(120));
    }

    console.log('\n📋 Summary:');
    const committeeAdmins = listUsersResult.users.filter(u => u.customClaims?.role === 'committee_admin');
    const superAdmins = listUsersResult.users.filter(u => u.customClaims?.role === 'super_admin');
    const teams = listUsersResult.users.filter(u => u.customClaims?.role === 'team');
    const noRole = listUsersResult.users.filter(u => !u.customClaims?.role);

    console.log(`   Committee Admins: ${committeeAdmins.length}`);
    console.log(`   Super Admins:     ${superAdmins.length}`);
    console.log(`   Teams:            ${teams.length}`);
    console.log(`   No Role:          ${noRole.length}`);

    console.log('\n✅ Check complete!');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    throw error;
  }
}

checkAllUsers()
  .then(() => {
    console.log('\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
