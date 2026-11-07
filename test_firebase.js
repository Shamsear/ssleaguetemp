const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const admin = require('firebase-admin');

async function testFirebase() {
  console.log('Firebase project id:', process.env.FIREBASE_ADMIN_PROJECT_ID);
  console.log('Client email:', process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    }
    const db = admin.firestore();
    console.log('Querying users collection...');
    const snap = await db.collection('users').limit(2).get();
    console.log('Users count:', snap.docs.length);
    snap.docs.forEach(d => console.log('User:', d.id, d.data().username, d.data().email, d.data().role));
  } catch (err) {
    console.error('Firebase error:', err);
  }
}

testFirebase();
