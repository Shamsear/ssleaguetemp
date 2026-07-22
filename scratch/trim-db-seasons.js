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
  const teamsSnapshot = await db.collection('teams').get();
  console.log(`Checking seasons arrays for trailing newlines across all teams...`);

  for (const doc of teamsSnapshot.docs) {
    const data = doc.data();
    const seasons = data.seasons || [];
    let updated = false;

    const trimmedSeasons = seasons.map(s => {
      if (typeof s === 'string' && s !== s.trim()) {
        updated = true;
        console.log(`[TRIM] Team "${data.name || doc.id}": Trimming "${s}" -> "${s.trim()}"`);
        return s.trim();
      }
      return s;
    });

    if (updated) {
      await db.collection('teams').doc(doc.id).update({
        seasons: trimmedSeasons,
        updated_at: new Date()
      });
      console.log(`[SAVED] Saved trimmed seasons for team: ${data.name || doc.id}`);
    }
  }

  console.log('✅ Trailing newline cleanup completed successfully.');
}

run().catch(console.error);
