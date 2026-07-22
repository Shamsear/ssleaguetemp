require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin
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

// Test functions replicated in pure JS for verification
async function testGetOrCreateBalance(teamId, teamName) {
  const docRef = db.collection('team_cash_balances').doc(teamId);
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    return { team_id: teamId, ...docSnap.data() };
  }

  const newBalance = {
    team_name: teamName,
    payment_type: 'seasonal',
    remaining_balance: 0,
    seasons_played: [],
    payments: [],
    deductions: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  await docRef.set(newBalance);
  return { team_id: teamId, ...newBalance };
}

async function testUpdatePaymentType(teamId, paymentType) {
  const docRef = db.collection('team_cash_balances').doc(teamId);
  await docRef.update({
    payment_type: paymentType,
    updated_at: new Date(),
  });
}

async function testRecordPayment(teamId, amount, seasonId, notes) {
  const docRef = db.collection('team_cash_balances').doc(teamId);
  const payment = {
    payment_id: 'test_payment_' + Math.random().toString(36).substring(2, 8),
    amount,
    season_id: seasonId,
    date: new Date(),
    notes,
    recorded_by: 'test_admin',
  };

  await docRef.update({
    remaining_balance: admin.firestore.FieldValue.increment(amount),
    payments: admin.firestore.FieldValue.arrayUnion(payment),
    updated_at: new Date(),
  });
}

async function testRecordDeduction(teamId, amount, seasonId) {
  const docRef = db.collection('team_cash_balances').doc(teamId);
  const deduction = {
    deduction_id: 'test_deduction_' + Math.random().toString(36).substring(2, 8),
    amount,
    season_id: seasonId,
    date: new Date(),
  };

  await docRef.update({
    remaining_balance: admin.firestore.FieldValue.increment(-amount),
    deductions: admin.firestore.FieldValue.arrayUnion(deduction),
    seasons_played: admin.firestore.FieldValue.arrayUnion(seasonId),
    updated_at: new Date(),
  });
}

async function runTests() {
  const testTeamId = 'test_team_99999';
  const testTeamName = 'Test Galacticos 99999';
  const testSeasonId = 'SSPSLS16';

  console.log('🚀 Starting Cash Balances Verification Tests...\n');

  try {
    // 1. Clear any existing test document
    console.log('🧹 Cleaning up any old test documents...');
    await db.collection('team_cash_balances').doc(testTeamId).delete();
    console.log('✅ Stale test document deleted.\n');

    // 2. Test Get/Create (Should initialize as Seasonal with 0 balance)
    console.log('⏳ Test 1: getOrCreateTeamCashBalance...');
    const b1 = await testGetOrCreateBalance(testTeamId, testTeamName);
    console.log('Fetched Balance:', JSON.stringify(b1, null, 2));
    if (b1.payment_type !== 'seasonal' || b1.remaining_balance !== 0) {
      throw new Error('Test 1 failed: Incorrect default payment type or balance');
    }
    console.log('✅ Test 1 Passed.\n');

    // 3. Test Update Payment Type
    console.log('⏳ Test 2: updatePaymentType to "upfront"...');
    await testUpdatePaymentType(testTeamId, 'upfront');
    const b2 = await testGetOrCreateBalance(testTeamId, testTeamName);
    console.log('Updated Payment Type:', b2.payment_type);
    if (b2.payment_type !== 'upfront') {
      throw new Error('Test 2 failed: payment type did not update to upfront');
    }
    console.log('✅ Test 2 Passed.\n');

    // 4. Test Record Payment (Upfront payment of 500)
    console.log('⏳ Test 3: recordCashPayment of 500...');
    await testRecordPayment(testTeamId, 500, testSeasonId, 'Test upfront UPI payment');
    const b3 = await testGetOrCreateBalance(testTeamId, testTeamName);
    console.log('Balance after payment:', b3.remaining_balance);
    if (b3.remaining_balance !== 500 || b3.payments.length !== 1) {
      throw new Error('Test 3 failed: balance not incremented to 500 or payment log missing');
    }
    console.log('✅ Test 3 Passed.\n');

    // 5. Test Record Deduction (Upfront season play: deduct 100)
    console.log('⏳ Test 4: recordCashDeduction of 100...');
    await testRecordDeduction(testTeamId, 100, testSeasonId);
    const b4 = await testGetOrCreateBalance(testTeamId, testTeamName);
    console.log('Balance after deduction:', b4.remaining_balance);
    console.log('Seasons played:', b4.seasons_played);
    if (b4.remaining_balance !== 400 || b4.deductions.length !== 1 || !b4.seasons_played.includes(testSeasonId)) {
      throw new Error('Test 4 failed: balance not decremented to 400, deduction log missing, or seasons_played not updated');
    }
    console.log('✅ Test 4 Passed.\n');

    // 6. Test Seasonal Deduction (Change type to seasonal, deduct 500)
    console.log('⏳ Test 5: Changing type to seasonal and recordCashDeduction of 500...');
    await testUpdatePaymentType(testTeamId, 'seasonal');
    await testRecordDeduction(testTeamId, 500, 'SSPSLS17');
    const b5 = await testGetOrCreateBalance(testTeamId, testTeamName);
    console.log('Balance after seasonal deduction:', b5.remaining_balance);
    console.log('Seasons played list:', b5.seasons_played);
    if (b5.remaining_balance !== -100 || b5.deductions.length !== 2) {
      throw new Error('Test 5 failed: balance not decremented by 500 (-100 expected)');
    }
    console.log('✅ Test 5 Passed.\n');

    // 7. Cleanup
    console.log('🧹 Cleaning up test document...');
    await db.collection('team_cash_balances').doc(testTeamId).delete();
    console.log('✅ Cleanup complete.');

    console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');

  } catch (error) {
    console.error('\n❌ VERIFICATION TEST FAILED:', error);
    process.exit(1);
  }
}

runTests();
