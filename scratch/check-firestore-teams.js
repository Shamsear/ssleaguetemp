const admin = require('firebase-admin');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin matching app configuration
if (admin.apps.length === 0) {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_ADMIN_PROJECT_ID}-default-rtdb.firebaseio.com`,
    });
  } else {
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
    });
  }
}
const db = admin.firestore();
const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function checkSync() {
  console.log('🔍 Checking Firebase Firestore for Season 18 teams...');

  try {
    // 1. Fetch team_seasons from Firestore for SSPSLS18
    const teamSeasonsSnapshot = await db.collection('team_seasons')
      .where('season_id', '==', 'SSPSLS18')
      .get();
    
    console.log(`\n🔥 Firestore: Found ${teamSeasonsSnapshot.size} team_seasons for SSPSLS18:`);
    const firestoreTeams = [];
    teamSeasonsSnapshot.forEach(doc => {
      const data = doc.data();
      firestoreTeams.push({
        id: doc.id,
        team_id: data.team_id,
        user_id: data.user_id,
        status: data.status,
        football_budget: data.football_budget,
        budget: data.budget
      });
    });
    console.table(firestoreTeams);

    // 2. Fetch teams metadata from Firestore teams collection
    const teamsSnapshot = await db.collection('teams').get();
    console.log(`\n🔥 Firestore: Found ${teamsSnapshot.size} total teams in 'teams' collection:`);
    const allTeams = [];
    teamsSnapshot.forEach(doc => {
      allTeams.push({ id: doc.id, ...doc.data() });
    });
    console.table(allTeams.map(t => ({ id: t.id, name: t.name, user_id: t.user_id })));

  } catch (error) {
    console.error('❌ Error checking databases:', error);
  }
}

checkSync();
