const { neon } = require('@neondatabase/serverless');
const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Replicate lib/firebase/admin.ts initialization
if (!admin.apps.length) {
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    
    if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_ADMIN_PROJECT_ID}-default-rtdb.firebaseio.com`,
      });
      console.log('Firebase Admin initialized with service account');
    } else if (projectId) {
      admin.initializeApp({
        projectId: projectId,
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
      });
      console.log(`Firebase Admin initialized with project ID: ${projectId}`);
    } else {
      admin.initializeApp();
      console.log('Firebase Admin initialized with default credentials');
    }
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
    process.exit(1);
  }
}

const db = admin.firestore();
const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function run() {
  try {
    const seasonId = 'SSPSLS18';
    console.log(`\n🔍 Auditing all team balances and player counts for season: ${seasonId}...\n`);

    // 1. Fetch Postgres teams
    const pgTeams = await sql`
      SELECT id, name, football_budget, football_spent, football_players_count
      FROM teams
      WHERE season_id = ${seasonId}
      ORDER BY name ASC
    `;

    const results = [];
    let mismatchCount = 0;

    for (const team of pgTeams) {
      // Get players from footballplayers table
      const players = await sql`
        SELECT id, name, position, acquisition_value
        FROM footballplayers
        WHERE team_id = ${team.id} AND is_sold = true AND round_id IN (
          SELECT id FROM rounds WHERE season_id = ${seasonId}
        )
      `;

      const pgSquadCount = players.length;
      const pgActualSpent = players.reduce((sum, p) => sum + Number(p.acquisition_value || 0), 0);
      const expectedBudget = 10000 - pgActualSpent;

      // Get Firebase document
      const tsId = `${team.id}_${seasonId}`;
      const tsDoc = await db.collection('team_seasons').doc(tsId).get();
      let fsData = null;
      if (tsDoc.exists) {
        fsData = tsDoc.data();
      }

      const fbCount = fsData ? (fsData.players_count || 0) : 0;
      const fbSpent = fsData ? (fsData.currency_system === 'dual' ? (fsData.football_spent || 0) : (fsData.total_spent || 0)) : 0;
      const fbBudget = fsData ? (fsData.currency_system === 'dual' ? (fsData.football_budget || 0) : (fsData.budget || 0)) : 0;

      const countMismatch = (pgSquadCount !== Number(team.football_players_count)) || (pgSquadCount !== fbCount);
      const spentMismatch = (pgActualSpent !== Number(team.football_spent)) || (pgActualSpent !== Number(fbSpent));
      const budgetMismatch = (expectedBudget !== Number(team.football_budget)) || (expectedBudget !== Number(fbBudget));
      const hasMismatch = countMismatch || spentMismatch || budgetMismatch;

      if (hasMismatch) mismatchCount++;

      results.push({
        'Team Name': team.name,
        'Roster': pgSquadCount,
        'PG Count': Number(team.football_players_count),
        'FB Count': fbCount,
        'Roster Spent': `£${pgActualSpent}`,
        'PG Spent': `£${team.football_spent}`,
        'FB Spent': `£${fbSpent}`,
        'Expected Budget': `£${expectedBudget}`,
        'PG Budget': `£${team.football_budget}`,
        'FB Budget': `£${fbBudget}`,
        'Status': hasMismatch ? '❌ MISMATCH' : '✅ OK'
      });
    }

    console.table(results);
    console.log(`\nAudit Summary: ${mismatchCount} out of ${pgTeams.length} teams have balance/count mismatches.`);

  } catch (error) {
    console.error('Error during audit:', error);
  }
}
run();
