const admin = require('firebase-admin');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function run() {
  console.log('🔄 Updating Poachers FC Owner Name to "ANOOP P"...\n');

  try {
    // 1. Update Firestore team document SSPSLT0030
    console.log('Step 1: Updating Firestore team "SSPSLT0030" owner_name...');
    const teamRef = db.collection('teams').doc('SSPSLT0030');
    await teamRef.update({
      owner_name: 'ANOOP P',
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('  ✅ Updated owner_name in Firestore teams/SSPSLT0030.');

    // 2. Update Firebase Auth Display Name for kWjOgq15QVeY2hDix8Sr3SwcKRt2
    console.log('Step 2: Updating Firebase Auth Display Name for UID kWjOgq15QVeY2hDix8Sr3SwcKRt2...');
    await auth.updateUser('kWjOgq15QVeY2hDix8Sr3SwcKRt2', {
      displayName: 'ANOOP P'
    });
    console.log('  ✅ Updated displayName in Firebase Auth.');

    console.log('\n🎉 Poachers FC Owner Name successfully updated to "ANOOP P"!');

  } catch (error) {
    console.error('❌ Update failed with error:', error);
  } finally {
    process.exit();
  }
}

run();
