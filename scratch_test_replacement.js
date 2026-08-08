require('dotenv').config({ path: '.env.local' });
const { getReplacementInfo, executePlayerReplacement } = require('./lib/admin/player-replacement');
const { neon } = require('@neondatabase/serverless');
const { adminDb } = require('./lib/firebase/admin');

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function runTest() {
  console.log('🏁 Starting Player Replacement Integration Test...');
  
  const seasonId = 'SSPSLS18';
  const originalPlayerId = '19'; // Joan García
  const teamId = 'SSPSLT0015'; // Blue Strikers
  const originalPrice = 20;
  
  // 1. Fetch info
  console.log('🔍 Fetching replacement info for Joan García...');
  const { getReplacementInfo } = require('./lib/admin/player-replacement');
  const info = await getReplacementInfo(originalPlayerId, seasonId);
  
  console.log(`   Original: ${info.originalPlayer.player_name} (Price: £${info.originalPlayer.purchase_price}M)`);
  console.log(`   Round: ${info.round.position} (${info.round.round_type})`);
  console.log(`   Candidates found: ${info.candidates.length}`);
  
  if (info.candidates.length === 0) {
    throw new Error('No candidate players found for replacement!');
  }
  
  // Find an available goalkeeper candidate
  const candidate = info.candidates.find(c => !c.is_sold && c.player_id !== originalPlayerId);
  if (!candidate) {
    throw new Error('No unsold goalkeeper candidates available for replacement test!');
  }
  
  console.log(`🎯 Chosen replacement candidate: ${candidate.player_name} (ID: ${candidate.player_id})`);
  
  // Get initial budget from Neon and Firestore
  const initialTeamRes = await sql`SELECT football_budget, football_spent FROM teams WHERE id = ${teamId} AND season_id = ${seasonId}`;
  const initialNeonBudget = initialTeamRes[0].football_budget;
  const initialNeonSpent = initialTeamRes[0].football_spent;
  
  const tsDoc = await adminDb.collection('team_seasons').doc(`${teamId}_${seasonId}`).get();
  const initialFbBudget = tsDoc.data()?.football_budget || tsDoc.data()?.budget || 0;
  
  console.log(`   Initial Budget - Neon: £${initialNeonBudget}M, Firestore: £${initialFbBudget}M`);
  
  // 2. Execute replacement
  console.log('🔄 Executing player replacement...');
  const testPrice = 25; // replacement price
  const { executePlayerReplacement } = require('./lib/admin/player-replacement');
  const execResult = await executePlayerReplacement({
    originalPlayerId,
    replacementPlayerId: candidate.player_id,
    teamId,
    seasonId,
    newPrice: testPrice,
    adminUser: { uid: 'test_admin', email: 'test@ssleague.com', username: 'Test Admin' }
  });
  
  console.log('   Execution result:', execResult.message);
  
  // 3. Verify updates
  console.log('🧪 Verifying database status after replacement...');
  
  // Check team_players table
  const tpOriginal = await sql`SELECT * FROM team_players WHERE player_id = ${originalPlayerId} AND season_id = ${seasonId}`;
  const tpReplacement = await sql`SELECT * FROM team_players WHERE player_id = ${candidate.player_id} AND season_id = ${seasonId}`;
  
  if (tpOriginal.length > 0) throw new Error('Assertion failed: Original player is still in team_players!');
  if (tpReplacement.length === 0) throw new Error('Assertion failed: Replacement player is not in team_players!');
  if (tpReplacement[0].purchase_price !== testPrice) throw new Error(`Assertion failed: Purchase price should be ${testPrice}!`);
  
  // Check footballplayers table
  const fpOriginal = await sql`SELECT is_sold, team_id, acquisition_value FROM footballplayers WHERE id = ${originalPlayerId}`;
  const fpReplacement = await sql`SELECT is_sold, team_id, acquisition_value FROM footballplayers WHERE id = ${candidate.player_id}`;
  
  if (fpOriginal[0].is_sold || fpOriginal[0].team_id !== null) throw new Error('Assertion failed: Original player should be marked unsold!');
  if (!fpReplacement[0].is_sold || fpReplacement[0].team_id !== teamId) throw new Error('Assertion failed: Replacement player should be sold to team!');
  if (fpReplacement[0].acquisition_value !== testPrice) throw new Error('Assertion failed: Replacement player acquisition value mismatch!');
  
  // Check budgets
  const afterTeamRes = await sql`SELECT football_budget, football_spent FROM teams WHERE id = ${teamId} AND season_id = ${seasonId}`;
  const expectedNeonBudget = Number(initialNeonBudget) + originalPrice - testPrice;
  const expectedNeonSpent = Number(initialNeonSpent) - originalPrice + testPrice;
  
  if (Number(afterTeamRes[0].football_budget) !== expectedNeonBudget) {
    throw new Error(`Budget mismatch in Neon: Expected ${expectedNeonBudget}, got ${afterTeamRes[0].football_budget}`);
  }
  
  if (Number(afterTeamRes[0].football_spent) !== expectedNeonSpent) {
    throw new Error(`Spent mismatch in Neon: Expected ${expectedNeonSpent}, got ${afterTeamRes[0].football_spent}`);
  }
  
  const tsDocAfter = await adminDb.collection('team_seasons').doc(`${teamId}_${seasonId}`).get();
  const afterFbBudget = tsDocAfter.data()?.football_budget || tsDocAfter.data()?.budget || 0;
  
  if (afterFbBudget !== expectedNeonBudget) {
    throw new Error(`Budget mismatch in Firestore: Expected ${expectedNeonBudget}, got ${afterFbBudget}`);
  }
  
  console.log('   ✅ Verification checks passed!');
  
  // 4. Revert replacement back
  console.log('🔄 Reverting replacement back to restore original state...');
  await executePlayerReplacement({
    originalPlayerId: candidate.player_id,
    replacementPlayerId: originalPlayerId,
    teamId,
    seasonId,
    newPrice: originalPrice,
    adminUser: { uid: 'test_admin', email: 'test@ssleague.com', username: 'Test Admin' }
  });
  
  // Final checks
  const finalTeamRes = await sql`SELECT football_budget FROM teams WHERE id = ${teamId} AND season_id = ${seasonId}`;
  if (finalTeamRes[0].football_budget !== initialNeonBudget) {
    throw new Error(`Failed to restore budget: expected ${initialNeonBudget}, got ${finalTeamRes[0].football_budget}`);
  }
  
  console.log('✅ Revert successful! Original state restored.');
  console.log('🏆 INTEGRATION TEST PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
