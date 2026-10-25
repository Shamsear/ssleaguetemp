const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      let key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[key] = val;
    }
  }
});

async function testFirebase() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: envVars.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: envVars.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: envVars.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      databaseURL: envVars.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
  }

  console.log('Firebase initialized.');
  const db = admin.firestore();
  const collections = await db.listCollections();
  console.log('Firestore collections (' + collections.length + '):', collections.map(c => c.id).join(', '));

  try {
    const listUsersResult = await admin.auth().listUsers(10);
    console.log('Firebase Auth total sample users:', listUsersResult.users.length);
  } catch (e) {
    console.error('Firebase Auth error:', e.message);
  }

  try {
    const rtdb = admin.database();
    const snap = await rtdb.ref('/').shallow().get();
    console.log('RTDB root keys:', snap.val());
  } catch (e) {
    console.log('RTDB note:', e.message);
  }
}

testFirebase().catch(console.error);
