require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

async function main() {
  const adminDb = admin.firestore();
  const snapshot = await adminDb.collection('realplayers').limit(20).get();
  console.log('REAL PLAYERS NAMES:');
  snapshot.forEach(doc => {
    console.log(`- ID: ${doc.data().player_id}, Name: ${doc.data().name}`);
  });
}

main().catch(console.error);
