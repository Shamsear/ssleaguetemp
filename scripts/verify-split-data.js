const admin = require('firebase-admin');
const { neon } = require('@neondatabase/serverless');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

async function run() {
  console.log('🧐 VERIFYING TEAM SPLIT DATA...\n');

  try {
    // 1. Check SSPSLT0030 in Firestore
    console.log('--- Firestore: SSPSLT0030 (Poachers FC) ---');
    const doc30 = await db.collection('teams').doc('SSPSLT0030').get();
    if (doc30.exists) {
      const data = doc30.data();
      console.log(`  Name: ${data.name}`);
      console.log(`  Owner Name: ${data.owner_name}`);
      console.log(`  Seasons:`, data.seasons);
    } else {
      console.log('  ❌ SSPSLT0030 not found!');
    }

    // 2. Check SSPSLT0040 in Firestore
    console.log('\n--- Firestore: SSPSLT0040 (Ultra Legends) ---');
    const doc40 = await db.collection('teams').doc('SSPSLT0040').get();
    if (doc40.exists) {
      const data = doc40.data();
      console.log(`  Name: ${data.name}`);
      console.log(`  Owner Name: ${data.owner_name}`);
      console.log(`  Seasons:`, data.seasons);
      console.log(`  UserId: ${data.userId}`);
      
      // Check user document
      if (data.userId) {
        const userDoc = await db.collection('users').doc(data.userId).get();
        if (userDoc.exists) {
          console.log(`  ✅ User document found: email = ${userDoc.data().email}, username = ${userDoc.data().username}`);
        } else {
          console.log('  ❌ User profile document NOT found in users collection!');
        }
      }
    } else {
      console.log('  ❌ SSPSLT0040 not found!');
    }

    // 3. Check SQL teamstats
    console.log('\n--- SQL: teamstats ---');
    const stats30 = await sql`SELECT team_id, team_name, season_id FROM teamstats WHERE team_id = 'SSPSLT0030'`;
    console.log(`  SSPSLT0030 stats:`, stats30);
    const stats40 = await sql`SELECT team_id, team_name, season_id FROM teamstats WHERE team_id = 'SSPSLT0040'`;
    console.log(`  SSPSLT0040 stats:`, stats40);

    // 4. Check SQL team_trophies
    console.log('\n--- SQL: team_trophies ---');
    const trophies30 = await sql`SELECT team_id, team_name, season_id, trophy_name FROM team_trophies WHERE team_id = 'SSPSLT0030'`;
    console.log(`  SSPSLT0030 trophies:`, trophies30);
    const trophies40 = await sql`SELECT team_id, team_name, season_id, trophy_name FROM team_trophies WHERE team_id = 'SSPSLT0040'`;
    console.log(`  SSPSLT0040 trophies:`, trophies40);

    // 5. Check SQL realplayerstats
    console.log('\n--- SQL: realplayerstats counts ---');
    const rp30 = await sql`SELECT season_id, COUNT(*) FROM realplayerstats WHERE team_id = 'SSPSLT0030' GROUP BY season_id`;
    console.log(`  SSPSLT0030 realplayerstats:`, rp30);
    const rp40 = await sql`SELECT season_id, COUNT(*) FROM realplayerstats WHERE team_id = 'SSPSLT0040' GROUP BY season_id`;
    console.log(`  SSPSLT0040 realplayerstats:`, rp40);

  } catch (error) {
    console.error(error);
  } finally {
    process.exit();
  }
}

run();
