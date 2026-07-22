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

// List of all deleted payments from task-786 and task-955
const deletedPayments = [
  // Classic Tens
  { teamId: 'SSPSLT0001', seasonId: 'SSPSLS9', amount: 100 },
  { teamId: 'SSPSLT0001', seasonId: 'SSPSLS10', amount: 100 },
  { teamId: 'SSPSLT0001', seasonId: 'SSPSLS11', amount: 100 },
  { teamId: 'SSPSLT0001', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0001', seasonId: 'SSPSLS18', amount: 100 },
  
  // Manchester United
  { teamId: 'SSPSLT0002', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0002', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0002', seasonId: 'SSPSLS14', amount: 100 },
  { teamId: 'SSPSLT0002', seasonId: 'SSPSLS15', amount: 100 },
  { teamId: 'SSPSLT0002', seasonId: 'SSPSLS17', amount: 100 },

  // Red Hawks FC
  { teamId: 'SSPSLT0004', seasonId: 'SSPSLS10', amount: 100 },
  { teamId: 'SSPSLT0004', seasonId: 'SSPSLS11', amount: 100 },
  { teamId: 'SSPSLT0004', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0004', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0004', seasonId: 'SSPSLS17', amount: 100 },

  // TM Asgardians
  { teamId: 'SSPSLT0005', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0005', seasonId: 'SSPSLS15', amount: 100 },
  { teamId: 'SSPSLT0005', seasonId: 'SSPSLS17', amount: 300 },

  // FC Barcelona
  { teamId: 'SSPSLT0006', seasonId: 'SSPSLS15', amount: 100 },
  { teamId: 'SSPSLT0006', seasonId: 'SSPSLS16', amount: 500 },
  { teamId: 'SSPSLT0006', seasonId: 'SSPSLS16', amount: 200 },
  { teamId: 'SSPSLT0006', seasonId: 'SSPSLS17', amount: 100 },

  // La Masia
  { teamId: 'SSPSLT0008', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0008', seasonId: 'SSPSLS14', amount: 100 },
  { teamId: 'SSPSLT0008', seasonId: 'SSPSLS15', amount: 100 },
  { teamId: 'SSPSLT0008', seasonId: 'SSPSLS16', amount: 500 },
  { teamId: 'SSPSLT0008', seasonId: 'SSPSLS16', amount: 400 },
  { teamId: 'SSPSLT0008', seasonId: 'SSPSLS17', amount: 100 },

  // Qatar Gladiators
  { teamId: 'SSPSLT0009', seasonId: 'SSPSLS17', amount: 100 },

  // Varsity Soccers
  { teamId: 'SSPSLT0010', seasonId: 'SSPSLS10', amount: 100 },
  { teamId: 'SSPSLT0010', seasonId: 'SSPSLS11', amount: 100 },
  { teamId: 'SSPSLT0010', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0010', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0010', seasonId: 'SSPSLS17', amount: 100 },

  // Spartans United
  { teamId: 'SSPSLT0011', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0011', seasonId: 'SSPSLS14', amount: 100 },
  { teamId: 'SSPSLT0011', seasonId: 'SSPSLS15', amount: 100 },

  // Psychoz
  { teamId: 'SSPSLT0013', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0013', seasonId: 'SSPSLS15', amount: 100 },
  { teamId: 'SSPSLT0013', seasonId: 'SSPSLS16', amount: 500 },
  { teamId: 'SSPSLT0013', seasonId: 'SSPSLS16', amount: 300 },
  { teamId: 'SSPSLT0013', seasonId: 'SSPSLS17', amount: 100 },

  // Legends FC
  { teamId: 'SSPSLT0015', seasonId: 'SSPSLS17', amount: 100 },
  { teamId: 'SSPSLT0015', seasonId: 'SSPSLS18', amount: 100 },

  // Blue Strikers
  { teamId: 'SSPSLT0016', seasonId: 'SSPSLS17', amount: 100 },
  { teamId: 'SSPSLT0016', seasonId: 'SSPSLS18', amount: 100 },

  // Titans
  { teamId: 'SSPSLT0018', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0018', seasonId: 'SSPSLS14', amount: 100 },
  { teamId: 'SSPSLT0018', seasonId: 'SSPSLS15', amount: 100 },

  // Skill 555
  { teamId: 'SSPSLT0020', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0020', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0020', seasonId: 'SSPSLS14', amount: 100 },
  { teamId: 'SSPSLT0020', seasonId: 'SSPSLS16', amount: 500 },
  { teamId: 'SSPSLT0020', seasonId: 'SSPSLS16', amount: 400 },
  { teamId: 'SSPSLT0020', seasonId: 'SSPSLS17', amount: 100 },

  // Los Galacticos
  { teamId: 'SSPSLT0021', seasonId: 'SSPSLS17', amount: 100 },

  // Sentinels
  { teamId: 'SSPSLT0022', seasonId: 'SSPSLS13', amount: 100 },
  { teamId: 'SSPSLT0022', seasonId: 'SSPSLS14', amount: 100 },

  // Magicians FC
  { teamId: 'SSPSLT0024', seasonId: 'SSPSLS14', amount: 100 },

  // Portland Timbers
  { teamId: 'SSPSLT0026', seasonId: 'SSPSLS9', amount: 100 },
  { teamId: 'SSPSLT0026', seasonId: 'SSPSLS10', amount: 100 },
  { teamId: 'SSPSLT0026', seasonId: 'SSPSLS11', amount: 100 },
  { teamId: 'SSPSLT0026', seasonId: 'SSPSLS17', amount: 100 },

  // Pes Guardians
  { teamId: 'SSPSLT0027', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0027', seasonId: 'SSPSLS14', amount: 100 },

  // The Reds
  { teamId: 'SSPSLT0028', seasonId: 'SSPSLS12', amount: 100 },
  { teamId: 'SSPSLT0028', seasonId: 'SSPSLS13', amount: 100 },

  // El Bicho-7
  { teamId: 'SSPSLT0029', seasonId: 'SSPSLS12', amount: 100 },

  // Los Blancos
  { teamId: 'SSPSLT0034', seasonId: 'SSPSLS17', amount: 100 }
];

async function run() {
  console.log(`Restoring database states...`);

  // Group by teamId
  const teamMap = new Map();
  deletedPayments.forEach(p => {
    if (!teamMap.has(p.teamId)) teamMap.set(p.teamId, []);
    teamMap.get(p.teamId).push(p);
  });

  for (const [teamId, paymentsToRestore] of teamMap.entries()) {
    const docRef = db.collection('team_cash_balances').doc(teamId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) continue;

    const data = docSnap.data();
    const currentPayments = data.payments || [];
    let updated = false;

    paymentsToRestore.forEach(p => {
      // Check if a payment with the same season_id and amount already exists
      const exists = currentPayments.some(cp => cp.season_id === p.seasonId && cp.amount === p.amount);
      if (!exists) {
        currentPayments.push({
          payment_id: `restored_${p.seasonId}_${p.amount}_${Math.random().toString(36).substr(2, 6)}`,
          amount: p.amount,
          season_id: p.seasonId,
          notes: 'Restored original payment',
          recorded_by: 'System Restore',
          date: new Date()
        });
        console.log(`[RESTORE] Restored ${p.seasonId} payment of ₹${p.amount} for team ${teamId}`);
        updated = true;
      }
    });

    if (updated) {
      // Recalculate remaining balance based on actual seasons count
      const teamDoc = await db.collection('teams').doc(teamId).get();
      const teamData = teamDoc.exists ? teamDoc.data() : {};
      const seasonsCount = teamData.seasons?.length || 0;
      const totalPaymentsSum = currentPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalDeductions = seasonsCount * 100;
      const newBalance = totalPaymentsSum - totalDeductions;

      await docRef.update({
        payments: currentPayments,
        remaining_balance: newBalance,
        updated_at: new Date()
      });
      console.log(`[SAVED] Saved restored state for team ${teamId}. New remaining_balance: ₹${newBalance}`);
    }
  }

  console.log('✅ Database restore completed successfully.');
}

run().catch(console.error);
