require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

async function run() {
  const teamDoc = await db.collection('teams').doc('SSPSLT0005').get();
  if (teamDoc.exists) {
    console.log('TM Asgardians doc data:', JSON.stringify(teamDoc.data(), null, 2));
  } else {
    console.log('Team SSPSLT0005 not found!');
  }
}

run().catch(console.error);
