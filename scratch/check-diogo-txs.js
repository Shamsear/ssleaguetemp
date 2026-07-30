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

async function check() {
  try {
    const snap = await db.collection('transactions').get();
    const matches = [];
    snap.docs.forEach(doc => {
      const data = doc.data();
      const desc = data.description || '';
      const name = data.player_name || '';
      if (desc.includes('Diogo Costa') || name.includes('Diogo Costa')) {
        matches.push({ id: doc.id, ...data });
      }
    });
    console.log("Diogo Costa transactions in Firestore:", matches);
  } catch (err) {
    console.error(err);
  }
}
check();
