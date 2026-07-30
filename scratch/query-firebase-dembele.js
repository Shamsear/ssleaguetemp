const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

if (!admin.apps.length) {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
  } else {
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
    });
  }
}

const db = admin.firestore();

async function queryAllTransactions() {
  try {
    console.log("=== SCANNING player_transactions FOR DEMB ===");
    const snap = await db.collection('player_transactions').get();
    console.log(`Fetched ${snap.size} total documents from player_transactions.`);
    let matchCount1 = 0;
    snap.docs.forEach(doc => {
      const data = doc.data();
      const str = JSON.stringify(data).toLowerCase();
      if (str.includes('demb')) {
        console.log("Match in player_transactions:", doc.id, "=>", JSON.stringify(data, null, 2));
        matchCount1++;
      }
    });
    console.log(`Total matches in player_transactions: ${matchCount1}`);

    console.log("\n=== SCANNING transactions FOR DEMB ===");
    const snap2 = await db.collection('transactions').get();
    console.log(`Fetched ${snap2.size} total documents from transactions.`);
    let matchCount2 = 0;
    snap2.docs.forEach(doc => {
      const data = doc.data();
      const str = JSON.stringify(data).toLowerCase();
      if (str.includes('demb')) {
        console.log("Match in transactions:", doc.id, "=>", JSON.stringify(data, null, 2));
        matchCount2++;
      }
    });
    console.log(`Total matches in transactions: ${matchCount2}`);
  } catch (err) {
    console.error(err);
  }
}

queryAllTransactions();
