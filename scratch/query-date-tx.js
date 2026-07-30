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

async function queryDateTransactions() {
  try {
    const start = new Date('2025-12-03T00:00:00Z');
    const end = new Date('2025-12-03T23:59:59Z');
    
    const snap = await db.collection('transactions')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .get();
    
    console.log(`Found ${snap.size} transactions on 2025-12-03.`);
    snap.docs.forEach(doc => {
      console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2));
    });
  } catch (err) {
    console.error(err);
  }
}
queryDateTransactions();
