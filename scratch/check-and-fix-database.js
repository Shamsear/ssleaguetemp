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
const getSeasonNum = (id) => parseInt(id.replace(/\D/g, '')) || 0;

async function run() {
  const teamsSnapshot = await db.collection('teams').get();
  const balancesSnapshot = await db.collection('team_cash_balances').get();

  const balancesMap = new Map();
  balancesSnapshot.forEach(doc => {
    balancesMap.set(doc.id, doc.data());
  });

  console.log(`Analyzing database with strict season-wise prepaid rules...`);
  const report = [];

  for (const doc of teamsSnapshot.docs) {
    const teamData = doc.data();
    const teamId = doc.id;
    const teamName = teamData.name || teamData.team_name || teamId;
    
    // Trim and sort seasons played ascending
    const seasons = [...(teamData.seasons || [])]
      .map(s => typeof s === 'string' ? s.trim() : s)
      .sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

    const balanceDoc = balancesMap.get(teamId);
    if (!balanceDoc) continue;

    const payments = balanceDoc.payments || [];
    const seasonPlans = balanceDoc.season_plans || {};
    const basePlan = balanceDoc.payment_type || 'seasonal';

    let carryover = 0;
    const cleanPayments = [];
    const unnecessaryPayments = [];

    seasons.forEach((seasonId) => {
      const planForSeason = seasonPlans[seasonId] || basePlan;
      const seasonPayments = payments.filter(p => p.season_id === seasonId);
      const totalPaidThisSeason = seasonPayments.reduce((s, p) => s + p.amount, 0);

      // A payment is unnecessary only if:
      // 1. The team already has positive carryover balance >= 100 (fully covering the season fee).
      // 2. The team's plan for this season is Seasonal (since Upfront subscribers always pay/renew).
      // 3. A payment was actually logged for this season.
      if (carryover >= 100 && planForSeason === 'seasonal' && totalPaidThisSeason > 0) {
        unnecessaryPayments.push({
          seasonId,
          amount: totalPaidThisSeason,
          message: `Logged ₹${totalPaidThisSeason} for S${getSeasonNum(seasonId)} (Seasonal), but carryover was already ₹${carryover} (fully covered).`
        });
      } else {
        // Keep these payments
        cleanPayments.push(...seasonPayments);
        // Deduct fee and add payments to carryover
        const netAfterPayments = carryover - 100 + totalPaidThisSeason;
        if (netAfterPayments >= 0) {
          carryover = netAfterPayments;
        } else {
          carryover = 0; // reset carryover if negative (negative balance does not carry over)
        }
      }
    });

    if (unnecessaryPayments.length > 0) {
      report.push({
        teamId,
        teamName,
        currentBalance: balanceDoc.remaining_balance,
        unnecessaryPayments,
        cleanPayments
      });
    }
  }

  console.log('\n--- STRICT SEASON-WISE DISCREPANCIES ---');
  console.log(JSON.stringify(report, null, 2));

  // Perform Firestore updates to automatically fix the database
  if (report.length > 0) {
    console.log(`\nApplying database updates to fix cash balance histories...`);
    for (const teamReport of report) {
      const docRef = db.collection('team_cash_balances').doc(teamReport.teamId);
      const newPayments = teamReport.cleanPayments;
      
      // Recalculate remaining_balance
      const teamDoc = await db.collection('teams').doc(teamReport.teamId).get();
      const teamData = teamDoc.exists ? teamDoc.data() : {};
      const seasonsCount = teamData.seasons?.length || 0;
      const totalPaymentsSum = newPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalDeductions = seasonsCount * 100;
      const newBalance = totalPaymentsSum - totalDeductions;

      await docRef.update({
        payments: newPayments,
        remaining_balance: newBalance,
        updated_at: new Date()
      });
      console.log(`[UPDATE] Updated Team "${teamReport.teamName}" remaining_balance to ₹${newBalance} (previously ₹${teamReport.currentBalance}).`);
    }
  } else {
    console.log('✅ No discrepancies found. Database is perfectly aligned with season-wise prepaid rules!');
  }
}

run().catch(console.error);
