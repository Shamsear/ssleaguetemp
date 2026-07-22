require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const { neon } = require('@neondatabase/serverless');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
if (!connectionString) {
  console.error('NEON_TOURNAMENT_DB_URL is not set.');
  process.exit(1);
}
const sql = neon(connectionString);

async function runFix() {
  console.log('=== RUNNING CORRECTED DATABASE FIX FOR FC BARCELONA ===\n');

  try {
    // ----------------------------------------------------
    // 1. FIRESTORE: Update teams collection
    // ----------------------------------------------------
    console.log('--- Step 1: Updating teams collection ---');
    const doc6 = await db.collection('teams').doc('SSPSLT0006').get();
    const doc7 = await db.collection('teams').doc('SSPSLT0007').get();

    if (!doc6.exists || !doc7.exists) {
      throw new Error('One or both teams not found in teams collection.');
    }

    const data6 = doc6.data();
    const data7 = doc7.data();

    // S8, S9, S10 should be removed from SSPSLT0006
    const updatedSeasons6 = (data6.seasons || []).filter(s => !['SSPSLS8', 'SSPSLS9', 'SSPSLS10'].includes(s));
    // S8, S10 should be added to SSPSLT0007
    const updatedSeasons7 = [...new Set([...(data7.seasons || []), 'SSPSLS8', 'SSPSLS10'])];

    await db.collection('teams').doc('SSPSLT0006').update({
      seasons: updatedSeasons6,
      updated_at: new Date()
    });
    console.log(`Updated seasons list for SSPSLT0006 (FC Barcelona):`, updatedSeasons6);

    await db.collection('teams').doc('SSPSLT0007').update({
      seasons: updatedSeasons7,
      updated_at: new Date()
    });
    console.log(`Updated seasons list for SSPSLT0007 (FC Barcelona(A)):`, updatedSeasons7);


    // ----------------------------------------------------
    // 2. FIRESTORE: Update team_cash_balances collection
    // ----------------------------------------------------
    console.log('\n--- Step 2: Updating team_cash_balances ---');
    const balDoc6 = await db.collection('team_cash_balances').doc('SSPSLT0006').get();
    const balDoc7 = await db.collection('team_cash_balances').doc('SSPSLT0007').get();

    if (!balDoc6.exists || !balDoc7.exists) {
      throw new Error('One or both teams not found in team_cash_balances collection.');
    }

    const balData6 = balDoc6.data();
    const balData7 = balDoc7.data();

    const payments6 = balData6.payments || [];
    const payments7 = balData7.payments || [];

    // Extract S8 and S10 payments from SSPSLT0006
    const paymentS8 = payments6.find(p => p.season_id === 'SSPSLS8');
    const paymentS10 = payments6.find(p => p.season_id === 'SSPSLS10');

    // Keep payments that are NOT S8, S9, or S10 for SSPSLT0006
    const newPayments6 = payments6.filter(p => !['SSPSLS8', 'SSPSLS9', 'SSPSLS10'].includes(p.season_id));

    // Construct new payments for SSPSLT0007
    const newPayments7 = [...payments7];
    if (paymentS8 && !newPayments7.some(p => p.season_id === 'SSPSLS8')) {
      newPayments7.push(paymentS8);
      console.log(`Transferred payment S8 to SSPSLT0007.`);
    }
    if (paymentS10 && !newPayments7.some(p => p.season_id === 'SSPSLS10')) {
      newPayments7.push(paymentS10);
      console.log(`Transferred payment S10 to SSPSLT0007.`);
    }

    // Calculate remaining_balance for SSPSLT0006
    const deductionsCount6 = updatedSeasons6.length; 
    const deductionsTotal6 = deductionsCount6 * 100;
    const paymentsTotal6 = newPayments6.reduce((sum, p) => sum + p.amount, 0);
    const newBal6 = paymentsTotal6 - deductionsTotal6;

    // Calculate remaining_balance for SSPSLT0007
    const deductionsCount7 = updatedSeasons7.length;
    const deductionsTotal7 = deductionsCount7 * 100;
    const paymentsTotal7 = newPayments7.reduce((sum, p) => sum + p.amount, 0);
    const newBal7 = paymentsTotal7 - deductionsTotal7;

    await db.collection('team_cash_balances').doc('SSPSLT0006').update({
      payments: newPayments6,
      remaining_balance: newBal6,
      updated_at: new Date()
    });
    console.log(`Updated cash balance for SSPSLT0006: remaining_balance = ${newBal6}`);

    await db.collection('team_cash_balances').doc('SSPSLT0007').update({
      payments: newPayments7,
      remaining_balance: newBal7,
      updated_at: new Date()
    });
    console.log(`Updated cash balance for SSPSLT0007: remaining_balance = ${newBal7}`);


    // ----------------------------------------------------
    // 3. POSTGRES (NEON): Update team stats and player stats
    // ----------------------------------------------------
    console.log('\n--- Step 3: Updating PostgreSQL (Neon) Database ---');
    
    // Update S8 teamstats
    await sql`
      UPDATE teamstats 
      SET team_id = 'SSPSLT0007', id = 'SSPSLT0007_SSPSLS8_historical'
      WHERE team_id = 'SSPSLT0006' AND season_id = 'SSPSLS8'
    `;
    console.log('Updated S8 teamstats ID and team_id.');

    // Update S10 teamstats
    await sql`
      UPDATE teamstats 
      SET team_id = 'SSPSLT0007', id = 'SSPSLT0007_SSPSLS10_historical'
      WHERE team_id = 'SSPSLT0006' AND season_id = 'SSPSLS10'
    `;
    console.log('Updated S10 teamstats ID and team_id.');

    // Delete duplicate S9 teamstats row for SSPSLT0006
    await sql`
      DELETE FROM teamstats 
      WHERE team_id = 'SSPSLT0006' AND season_id = 'SSPSLS9'
    `;
    console.log('Deleted duplicate S9 teamstats row for SSPSLT0006.');

    // Update realplayerstats for S8, S9, S10 to SSPSLT0007
    const playerStatsUpdate = await sql`
      UPDATE realplayerstats 
      SET team_id = 'SSPSLT0007' 
      WHERE team_id = 'SSPSLT0006' AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`Updated realplayerstats rows.`);

    console.log('\n=== FIX COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('\n❌ Fix failed:', err);
  }

  process.exit(0);
}

runFix();
