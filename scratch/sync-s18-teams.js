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

async function syncS18Teams() {
  console.log('🔄 Starting Season 18 teams synchronization...');

  try {
    // 1. Get canonical names from Firestore teams collection
    const teamsSnapshot = await db.collection('teams').get();
    const teamNamesMap = {};
    teamsSnapshot.forEach(doc => {
      teamNamesMap[doc.id] = doc.data().name || 'Team';
    });

    // 2. Fetch all 12 Season 18 team_seasons from Firestore
    const teamSeasonsSnapshot = await db.collection('team_seasons')
      .where('season_id', '==', 'SSPSLS18')
      .get();
    
    console.log(`Found ${teamSeasonsSnapshot.size} teams in Firestore for Season 18.`);

    // 3. Upsert into Postgres
    let successCount = 0;
    for (const doc of teamSeasonsSnapshot.docs) {
      const data = doc.data();
      const teamId = data.team_id;
      const userId = data.user_id || '';
      const budget = parseFloat(data.football_budget) || 10000;
      const name = teamNamesMap[teamId] || data.team_name || 'Team';

      console.log(`- Syncing: ${teamId} | ${name} | User: ${userId} | Budget: £${budget}`);

      await sql`
        INSERT INTO teams (
          id, name, firebase_uid, season_id, football_budget, football_spent, created_at, updated_at
        ) VALUES (
          ${teamId}, ${name}, ${userId}, 'SSPSLS18', ${budget}, 0, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          firebase_uid = EXCLUDED.firebase_uid,
          season_id = EXCLUDED.season_id,
          football_budget = EXCLUDED.football_budget,
          football_spent = EXCLUDED.football_spent,
          updated_at = NOW()
      `;
      successCount++;
    }

    console.log(`\n✅ Upserted ${successCount} teams in Postgres.`);

    // 4. Verify teams in Postgres
    const finalTeams = await sql`
      SELECT id, name, season_id, football_budget 
      FROM teams
      WHERE season_id = 'SSPSLS18'
      ORDER BY name ASC
    `;
    console.log('\n📊 Current Season 18 Teams in Postgres after sync:');
    console.table(finalTeams);

  } catch (error) {
    console.error('❌ Error syncing Season 18 teams:', error);
  }
}

syncS18Teams();
