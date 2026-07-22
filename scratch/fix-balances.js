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

  console.log(`Fixing cash balance histories...`);

  for (const doc of teamsSnapshot.docs) {
    const teamData = doc.data();
    const teamId = doc.id;
    const teamName = teamData.name || teamData.team_name || teamId;
    const seasons = [...(teamData.seasons || [])].map(s => typeof s === 'string' ? s.trim() : s).sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

    const balanceDoc = balancesMap.get(teamId);
    if (!balanceDoc) continue;

    const payments = balanceDoc.payments || [];
    const seasonPlans = balanceDoc.season_plans || {};
    const basePlan = balanceDoc.payment_type || 'seasonal';

    let currentPrepaidBalance = 0;
    const cleanPayments = [];
    let updated = false;

    seasons.forEach((seasonId) => {
      currentPrepaidBalance -= 100;

      const seasonPayments = payments.filter(p => p.season_id === seasonId);
      const totalPaidThisSeason = seasonPayments.reduce((s, p) => s + p.amount, 0);
      const balanceBeforeSeason = currentPrepaidBalance + 100;

      if (balanceBeforeSeason >= 100 && totalPaidThisSeason > 0) {
        // Unnecessary payment - team was already covered! Skip adding this payment
        console.log(`[FIX] Team "${teamName}": Removing unnecessary S${getSeasonNum(seasonId)} payment of ₹${totalPaidThisSeason} (already had ₹${balanceBeforeSeason} prepaid).`);
        updated = true;
      } else {
        // Keep these payments
        cleanPayments.push(...seasonPayments);
        currentPrepaidBalance += totalPaidThisSeason;
      }

      if (currentPrepaidBalance < 0) {
        currentPrepaidBalance = 0;
      }
    });

    if (updated) {
      const docRef = db.collection('team_cash_balances').doc(teamId);
      const newBalance = cleanPayments.reduce((s, p) => s + p.amount, 0) - (seasons.length * 100);
      
      await docRef.update({
        payments: cleanPayments,
        remaining_balance: newBalance,
        updated_at: new Date()
      });
      console.log(`[UPDATE] Updated Team "${teamName}" remaining_balance to ₹${newBalance} (previously ₹${balanceDoc.remaining_balance}).`);
    }
  }

  console.log('✅ Balance cleanup completed successfully.');
}

run().catch(console.error);
