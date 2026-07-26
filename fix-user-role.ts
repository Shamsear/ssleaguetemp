/**
 * Script to fix a user's role and set them as committee admin
 * Usage: npx tsx fix-user-role.ts <email> <seasonId>
 * Example: npx tsx fix-user-role.ts admin@example.com SSPSLS18
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { adminAuth, adminDb } from './lib/firebase/admin';

async function fixUserRole(email: string, seasonId: string) {
  console.log('\n🔧 Starting user role fix...\n');
  console.log(`📧 Email: ${email}`);
  console.log(`🎯 Season ID: ${seasonId}\n`);

  try {
    // Step 1: Get user by email
    console.log('1️⃣ Looking up user by email...');
    const userRecord = await adminAuth.getUserByEmail(email);
    console.log(`   ✅ Found user: ${userRecord.uid}`);

    // Step 2: Update Firestore document
    console.log('\n2️⃣ Updating Firestore user document...');
    const userRef = adminDb.collection('users').doc(userRecord.uid);
    
    await userRef.update({
      role: 'committee_admin',
      seasonId: seasonId,
      seasonName: `Season ${seasonId.replace('SSPSLS', '')}`,
      updated_at: new Date()
    });
    console.log(`   ✅ Firestore document updated`);

    // Step 3: Set custom claims (this is crucial for JWT token auth)
    console.log('\n3️⃣ Setting Firebase custom claims...');
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: 'committee_admin',
      seasonId: seasonId
    });
    console.log(`   ✅ Custom claims set`);

    // Step 4: Verify the changes
    console.log('\n4️⃣ Verifying changes...');
    const updatedUser = await adminAuth.getUser(userRecord.uid);
    const customClaims = updatedUser.customClaims || {};
    
    const firestoreDoc = await userRef.get();
    const firestoreData = firestoreDoc.data();

    console.log('\n📊 Current User State:');
    console.log('   ┌─────────────────────────────────────');
    console.log(`   │ Email:     ${updatedUser.email}`);
    console.log(`   │ UID:       ${updatedUser.uid}`);
    console.log(`   │ JWT Role:  ${customClaims.role || 'NOT SET'}`);
    console.log(`   │ JWT Season: ${customClaims.seasonId || 'NOT SET'}`);
    console.log(`   │ DB Role:   ${firestoreData?.role || 'NOT SET'}`);
    console.log(`   │ DB Season: ${firestoreData?.seasonId || 'NOT SET'}`);
    console.log('   └─────────────────────────────────────');

    if (customClaims.role === 'committee_admin' && customClaims.seasonId === seasonId) {
      console.log('\n✅ SUCCESS! User is now a committee admin for ' + seasonId);
      console.log('\n⚠️  IMPORTANT: User must log out and log back in for changes to take effect!');
    } else {
      console.log('\n⚠️  WARNING: Custom claims may not have been set correctly');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('❌ Usage: npx tsx fix-user-role.ts <email> <seasonId>');
  console.error('   Example: npx tsx fix-user-role.ts admin@example.com SSPSLS18');
  process.exit(1);
}

const [email, seasonId] = args;

fixUserRole(email, seasonId)
  .then(() => {
    console.log('\n✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
