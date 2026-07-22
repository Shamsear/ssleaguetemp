require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function inspectTeams() {
  const ids = ['SSPSLT0006', 'SSPSLT0007'];
  for (const id of ids) {
    console.log(`\n================ Inspecting Team ${id} ================`);
    const teamDoc = await db.collection('teams').doc(id).get();
    if (teamDoc.exists) {
      console.log('--- Teams Collection ---');
      console.log(JSON.stringify(teamDoc.data(), null, 2));
    } else {
      console.log('Team not found in teams collection.');
    }

    const balanceDoc = await db.collection('team_cash_balances').doc(id).get();
    if (balanceDoc.exists) {
      console.log('--- Team Cash Balances Collection ---');
      console.log(JSON.stringify(balanceDoc.data(), null, 2));
    } else {
      console.log('Team not found in team_cash_balances collection.');
    }
  }
}

inspectTeams();
