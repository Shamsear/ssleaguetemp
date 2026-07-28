import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

// Use dynamic import to avoid initialization issues
async function main() {
  const { adminAuth, adminDb } = await import('./lib/firebase/admin');

  console.log('🔍 Checking all committee admins for Season 18...\n');

  try {
    // Get all users from Firestore where role is committee_admin
    const usersSnapshot = await adminDb
      .collection('users')
      .where('role', '==', 'committee_admin')
      .get();

    console.log(`📊 Found ${usersSnapshot.size} committee admin(s) in Firestore\n`);

    if (usersSnapshot.empty) {
      console.log('⚠️  No committee admins found in Firestore');
      return;
    }

    let fixedCount = 0;
    let alreadyCorrectCount = 0;

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const uid = doc.id;
      const email = userData.email;
      const firestoreSeasonId = userData.seasonId || userData.season_id;

      console.log(`\n👤 Processing: ${email || uid}`);
      console.log(`   Firestore seasonId: ${firestoreSeasonId || 'NOT SET'}`);

      try {
        // Get current custom claims from Firebase Auth
        const user = await adminAuth.getUser(uid);
        const currentClaims = user.customClaims || {};
        
        console.log(`   Auth role: ${currentClaims.role || 'NOT SET'}`);
        console.log(`   Auth seasonId: ${currentClaims.seasonId || 'NOT SET'}`);

        // Determine what the seasonId should be
        let targetSeasonId = 'SSPSLS18'; // Default to S18
        
        // If Firestore has a seasonId, use that (could be S17, S16, etc.)
        if (firestoreSeasonId) {
          targetSeasonId = firestoreSeasonId;
        }

        // Check if update is needed
        const needsUpdate = 
          currentClaims.role !== 'committee_admin' || 
          currentClaims.seasonId !== targetSeasonId;

        if (needsUpdate) {
          console.log(`   ⚡ Updating custom claims...`);
          
          // Set custom claims
          await adminAuth.setCustomUserClaims(uid, {
            role: 'committee_admin',
            seasonId: targetSeasonId,
          });

          console.log(`   ✅ Updated to: role=committee_admin, seasonId=${targetSeasonId}`);
          fixedCount++;
        } else {
          console.log(`   ✅ Already correct: role=committee_admin, seasonId=${targetSeasonId}`);
          alreadyCorrectCount++;
        }

      } catch (userError) {
        console.error(`   ❌ Error processing user ${uid}:`, userError);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   Total committee admins: ${usersSnapshot.size}`);
    console.log(`   Already correct: ${alreadyCorrectCount}`);
    console.log(`   Fixed: ${fixedCount}`);
    
    if (fixedCount > 0) {
      console.log(`\n⚠️  IMPORTANT: Users must log out and log back in for changes to take effect!`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
main()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
