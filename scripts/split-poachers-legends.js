const admin = require('firebase-admin');
const { neon } = require('@neondatabase/serverless');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Verify admin configuration presence
if (!process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  console.error('❌ Missing Firebase Admin environment variables in .env.local!');
  process.exit(1);
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const auth = admin.auth();
const db = admin.firestore();
const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

async function run() {
  console.log('🏁 Starting Team Split Migration: FC Poachers & Ultra Legends...\n');

  try {
    const email = 'ultralegendsfc@historical.team';
    const password = 'UltraLegends123!';
    let uid = '';

    // === Step 1: Firebase Auth User Account Creation ===
    console.log(`Step 1: Checking/Creating Auth User Account for "${email}"...`);
    try {
      const existingUser = await auth.getUserByEmail(email);
      uid = existingUser.uid;
      console.log(`  ✅ Auth user already exists! UID: ${uid}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        const newUser = await auth.createUser({
          email,
          password,
          displayName: 'Ultra Legends',
        });
        uid = newUser.uid;
        console.log(`  ✅ Auth user created successfully! UID: ${uid}`);
      } else {
        throw error;
      }
    }

    // === Step 2: Firestore User Profile Document ===
    console.log(`Step 2: Creating Firestore user profile document for UID: ${uid}...`);
    const userRef = db.collection('users').doc(uid);
    await userRef.set({
      uid,
      email,
      username: 'ultralegends',
      role: 'team',
      teamName: 'Ultra Legends',
      isActive: true,
      isApproved: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  ✅ Firestore user document created.');

    // === Step 3: Create Firestore Team Document SSPSLT0040 (Ultra Legends) ===
    console.log('Step 3: Creating Firestore team document "SSPSLT0040" for Ultra Legends...');
    const newTeamRef = db.collection('teams').doc('SSPSLT0040');
    await newTeamRef.set({
      id: 'SSPSLT0040',
      name: 'Ultra Legends',
      team_name: 'Ultra Legends',
      owner_name: 'ANOOP S/NITHIN',
      userId: uid,
      owner_uid: uid,
      email,
      userEmail: email,
      hasUserAccount: true,
      is_active: true,
      is_historical: true,
      seasons: ['SSPSLS7', 'SSPSLS8', 'SSPSLS9'],
      name_history: ['Ultra Legends'],
      previous_names: ['Ultra Legends'],
      payment_type: 'seasonal',
      current_season_id: 'SSPSLS9',
      total_seasons_participated: 3,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('  ✅ Firestore team document "SSPSLT0040" created.');

    // === Step 4: Restore Firestore Team Document SSPSLT0030 (Poachers FC) ===
    console.log('Step 4: Restoring Firestore team document "SSPSLT0030" back to Poachers FC...');
    const oldTeamRef = db.collection('teams').doc('SSPSLT0030');
    const oldTeamDoc = await oldTeamRef.get();
    if (oldTeamDoc.exists) {
      await oldTeamRef.update({
        name: 'Poachers FC',
        team_name: 'Poachers FC',
        owner_name: 'ANOOP S',
        seasons: ['SSPSLS12'],
        name_history: ['Poachers FC'],
        previous_names: ['Poachers FC'],
        current_season_id: 'SSPSLS12',
        total_seasons_participated: 1,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('  ✅ Firestore team document "SSPSLT0030" updated and restored.');
    } else {
      console.warn('  ⚠️ Warning: Document "SSPSLT0030" not found in Firestore. Creating it now...');
      await oldTeamRef.set({
        id: 'SSPSLT0030',
        name: 'Poachers FC',
        team_name: 'Poachers FC',
        owner_name: 'ANOOP S',
        userId: 'kWjOgq15QVeY2hDix8Sr3SwcKRt2',
        email: 'poachersfc@historical.team',
        userEmail: 'poachersfc@historical.team',
        hasUserAccount: true,
        is_active: true,
        is_historical: true,
        seasons: ['SSPSLS12'],
        name_history: ['Poachers FC'],
        previous_names: ['Poachers FC'],
        payment_type: 'seasonal',
        current_season_id: 'SSPSLS12',
        total_seasons_participated: 1,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('  ✅ Firestore team document "SSPSLT0030" created from scratch.');
    }

    // === Step 5: Neon SQL updates ===
    console.log('Step 5: Running Neon Tournament DB SQL queries to migrate S7, S8, S9 records...');

    // 5a. teamstats
    console.log('  - Migrating teamstats entries...');
    const updateStatsResult = await sql`
      UPDATE teamstats 
      SET team_id = 'SSPSLT0040', id = REPLACE(id, 'SSPSLT0030', 'SSPSLT0040')
      WHERE team_id = 'SSPSLT0030' AND season_id IN ('SSPSLS7', 'SSPSLS8', 'SSPSLS9')
      RETURNING id, team_name, season_id
    `;
    console.log(`    ✅ Updated ${updateStatsResult.length} rows in teamstats:`);
    updateStatsResult.forEach(row => console.log(`      * Row: ${row.id} | Team Name: ${row.team_name} | Season: ${row.season_id}`));

    // 5b. team_trophies
    console.log('  - Migrating team_trophies entries...');
    const updateTrophiesResult = await sql`
      UPDATE team_trophies 
      SET team_id = 'SSPSLT0040'
      WHERE team_id = 'SSPSLT0030' AND season_id = 'SSPSLS9'
      RETURNING id, team_name, trophy_name
    `;
    console.log(`    ✅ Updated ${updateTrophiesResult.length} rows in team_trophies:`);
    updateTrophiesResult.forEach(row => console.log(`      * Row ID: ${row.id} | Team: ${row.team_name} | Trophy: ${row.trophy_name}`));

    // 5c. realplayerstats
    console.log('  - Migrating realplayerstats entries...');
    const updatePlayerStatsResult = await sql`
      UPDATE realplayerstats 
      SET team_id = 'SSPSLT0040'
      WHERE team_id = 'SSPSLT0030' AND season_id IN ('SSPSLS7', 'SSPSLS8', 'SSPSLS9')
      RETURNING id, season_id
    `;
    console.log(`    ✅ Updated ${updatePlayerStatsResult.length} rows in realplayerstats.`);

    console.log('\n🎉 ALL MIGRATION STEPS COMPLETED SUCCESSFULLY!');
    console.log(`\n🔑 Login Credentials created:`);
    console.log(`   - Email: ${email}`);
    console.log(`   - Password: ${password}`);

  } catch (error) {
    console.error('\n❌ Migration Failed with Error:', error);
  } finally {
    process.exit();
  }
}

run();
