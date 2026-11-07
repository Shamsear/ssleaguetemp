const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
});

async function run() {
  try {
    const { adminDb } = require('./lib/firebase/admin');
    if (!adminDb) {
      console.log('No firebase adminDb available');
      return;
    }
    const snap = await adminDb.collection('team_seasons').where('season_id', '==', 'SSPSLS19').get();
    console.log(`Firebase team_seasons count for S19: ${snap.size}`);
    if (snap.size > 0) {
      const batch = adminDb.batch();
      snap.docs.forEach(doc => {
        batch.update(doc.ref, {
          real_player_budget: 400,
          initial_real_player_budget: 400,
        });
      });
      await batch.commit();
      console.log('Updated Firebase team_seasons to 400');
    }
  } catch (err) {
    console.log('Firebase check/update error:', err.message);
  }
}

run().catch(console.error);
