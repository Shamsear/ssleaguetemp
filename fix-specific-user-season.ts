import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

// Use dynamic import to avoid initialization issues
async function main() {
  const { adminAuth, adminDb } = await import('./lib/firebase/admin');

  const targetUid = 'tkWYmkuHxFhuHUkOQfto2lu3Lc93';
  const targetSeasonId = 'SSPSLS18';

  console.log(`🔍 Fixing user: ${targetUid}\n`);

  try {
    // Get user from Firestore
    const userDoc = await adminDb.collection('users').doc(targetUid).get();

    if (!userDoc.exists) {
      console.log('❌ User not found in Firestore');
      console.log('Creating user document...');
      
      // Get user info from Auth
      const authUser = await adminAuth.getUser(targetUid);
      
      await adminDb.collection('users').doc(targetUid).set({
        email: authUser.email,
        role: 'committee_admin',
        seasonId: targetSeasonId,
        createdAt: new Date(),
      });
      
      console.log('✅ Created user document in Firestore');
    } else {
      const userData = userDoc.data();
      console.log('Current Firestore data:', {
        email: userData?.email,
        role: userData?.role,
        seasonId: userData?.seasonId || userData?.season_id || 'NOT SET',
      });

      // Update the document with seasonId
      await adminDb.collection('users').doc(targetUid).update({
        seasonId: targetSeasonId,
        role: 'committee_admin',
      });

      console.log(`✅ Updated Firestore: seasonId = ${targetSeasonId}`);
    }

    // Now update Firebase Auth custom claims
    await adminAuth.setCustomUserClaims(targetUid, {
      role: 'committee_admin',
      seasonId: targetSeasonId,
    });

    console.log(`✅ Updated Auth custom claims: role=committee_admin, seasonId=${targetSeasonId}`);

    // Verify the changes
    const user = await adminAuth.getUser(targetUid);
    console.log('\n✅ Verification - Custom claims:', user.customClaims);

    console.log('\n⚠️  IMPORTANT: User must log out and log back in for changes to take effect!');

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
