require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
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
  const teamsSnapshot = await db.collection('teams').get();
  let targetTeamId = null;
  teamsSnapshot.forEach(doc => {
    if (doc.data().name === 'Blue Strikers') {
      targetTeamId = doc.id;
      console.log('Found team: ', doc.id, doc.data());
    }
  });

  if (targetTeamId) {
    const balanceDoc = await db.collection('team_cash_balances').doc(targetTeamId).get();
    if (balanceDoc.exists) {
      console.log('Cash Balance Doc:', JSON.stringify(balanceDoc.data(), null, 2));
    } else {
      console.log('No cash balance doc found for ID:', targetTeamId);
    }
  } else {
    console.log('Blue Strikers not found in teams');
  }
}

run().catch(console.error);
