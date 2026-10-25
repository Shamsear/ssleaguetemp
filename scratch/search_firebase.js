const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed && !trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    let key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
});

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: envVars.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: envVars.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: envVars.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: envVars.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});

async function searchFirebase() {
  console.log('--- Checking Firebase Auth Users ---');
  try {
    let nextPageToken;
    const authMatches = [];
    do {
      const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
      for (const u of listUsersResult.users) {
        const uStr = JSON.stringify(u);
        if (/adhil|adil|shamseer|shamsear|sspslpsl0063|sspslpsl0024/i.test(uStr)) {
          console.log(`Auth Match: uid=${u.uid}, email=${u.email}, displayName=${u.displayName}`);
          authMatches.push({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            phoneNumber: u.phoneNumber,
            customClaims: u.customClaims,
            metadata: u.metadata
          });
        }
      }
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    console.log(`Total Auth matches: ${authMatches.length}`);
    fs.writeFileSync(path.join(__dirname, 'firebase_auth_matches.json'), JSON.stringify(authMatches, null, 2));
  } catch (err) {
    console.error('Firebase Auth search error:', err.message);
  }

  console.log('\n--- Checking Firestore Collections ---');
  const firestoreMatches = [];
  try {
    const db = admin.firestore();
    const collections = await db.listCollections();
    console.log(`Found ${collections.length} collections:`, collections.map(c => c.id).join(', '));

    for (const col of collections) {
      const colName = col.id;
      // Get all docs in collection
      const snap = await col.get();
      let count = 0;
      snap.forEach(doc => {
        const data = doc.data();
        const dataStr = JSON.stringify({ id: doc.id, ...data });
        if (/adhil|adil|shamseer|shamsear|sspslpsl0063|sspslpsl0024/i.test(dataStr)) {
          count++;
          firestoreMatches.push({
            collection: colName,
            docId: doc.id,
            data
          });
        }
      });
      if (count > 0) {
        console.log(`  -> [MATCH] Collection "${colName}": ${count} document(s) matched`);
      }
    }
    console.log(`Total Firestore matches: ${firestoreMatches.length}`);
    fs.writeFileSync(path.join(__dirname, 'firestore_matches.json'), JSON.stringify(firestoreMatches, null, 2));
  } catch (err) {
    console.error('Firestore search error:', err.message);
  }

  console.log('\n--- Checking Firebase Realtime Database ---');
  try {
    const rtdb = admin.database();
    const rootSnap = await rtdb.ref('/').once('value');
    const val = rootSnap.val();
    if (val) {
      console.log('RTDB root keys:', Object.keys(val));
      const rtdbStr = JSON.stringify(val);
      if (/adhil|adil|shamseer|shamsear|sspslpsl0063|sspslpsl0024/i.test(rtdbStr)) {
        console.log('Matches found in RTDB! Inspecting keys...');
        for (const [k, v] of Object.entries(val)) {
          const subStr = JSON.stringify(v);
          if (/adhil|adil|shamseer|shamsear|sspslpsl0063|sspslpsl0024/i.test(subStr)) {
            console.log(`  -> Match under RTDB path: /${k}`);
          }
        }
      } else {
        console.log('No matches found in RTDB.');
      }
    } else {
      console.log('RTDB is empty or null.');
    }
  } catch (err) {
    console.error('RTDB search error:', err.message);
  }

  process.exit(0);
}

searchFirebase().catch(err => {
  console.error('Fatal Firebase search error:', err);
  process.exit(1);
});
