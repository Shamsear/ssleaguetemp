require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
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

// Helper to sort seasons numerically
const getSeasonNum = (id) => parseInt(id.replace(/\D/g, '')) || 0;

async function run() {
  const teamsSnapshot = await db.collection('teams').get();
  const balancesSnapshot = await db.collection('team_cash_balances').get();

  const balancesMap = new Map();
  balancesSnapshot.forEach(doc => {
    balancesMap.set(doc.id, doc.data());
  });

  console.log(`Analyzing ${teamsSnapshot.size} teams...`);

  const report = [];

  for (const doc of teamsSnapshot.docs) {
    const teamData = doc.data();
    const teamId = doc.id;
    const teamName = teamData.name || teamData.team_name || teamId;
    const seasons = [...(teamData.seasons || [])].map(s => typeof s === 'string' ? s.trim() : s).sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

    const balanceDoc = balancesMap.get(teamId);
    if (!balanceDoc) {
      continue;
    }

    const payments = balanceDoc.payments || [];
    const seasonPlans = balanceDoc.season_plans || {};
    const basePlan = balanceDoc.payment_type || 'seasonal';

    let currentPrepaidBalance = 0;
    const mistakes = [];

    // Track chronological season deductions and payments
    seasons.forEach((seasonId) => {
      // Deduction for this season
      currentPrepaidBalance -= 100;

      // Find payments logged for this season
      const seasonPayments = payments.filter(p => p.season_id === seasonId);
      
      const planForSeason = seasonPlans[seasonId] || basePlan;

      if (seasonPayments.length > 1) {
        mistakes.push({
          seasonId,
          type: 'duplicate_payments',
          message: `Found ${seasonPayments.length} separate payments logged for ${seasonId.replace('SSPSLS', 'S')} (Total: ₹${seasonPayments.reduce((s, p) => s + p.amount, 0)}).`
        });
      }

      const totalPaidThisSeason = seasonPayments.reduce((s, p) => s + p.amount, 0);

      // If they had positive balance before this season's payments and still had a payment logged:
      // Wait, balance before deduction and payment:
      const balanceBeforeSeason = currentPrepaidBalance + 100; // restore the 100 deduction
      
      if (balanceBeforeSeason >= 100 && totalPaidThisSeason > 0) {
        mistakes.push({
          seasonId,
          type: 'unnecessary_payment',
          message: `Logged ₹${totalPaidThisSeason} for ${seasonId.replace('SSPSLS', 'S')}, but team already had a positive prepaid balance of ₹${balanceBeforeSeason} (fully covered).`
        });
      }

      // Add the payment to balance
      currentPrepaidBalance += totalPaidThisSeason;
      if (currentPrepaidBalance < 0) {
        currentPrepaidBalance = 0;
      }
    });

    if (mistakes.length > 0) {
      report.push({
        teamId,
        teamName,
        currentBalance: balanceDoc.remaining_balance,
        mistakes
      });
    }
  }

  console.log('--- ANALYSIS REPORT ---');
  console.log(JSON.stringify(report, null, 2));
}

run().catch(console.error);
