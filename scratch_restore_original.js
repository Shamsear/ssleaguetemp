require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const { adminDb } = require('./lib/firebase/admin');

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function main() {
  console.log('🔄 Restoring original database state...');
  
  const seasonId = 'SSPSLS18';
  const originalPlayerId = '19'; // Joan García
  const replacementPlayerId = 'dd6fe5ea-27bf-4fad-aae1-e6d4ebdd5584'; // Peter Gulacsi
  const teamId = 'SSPSLT0015'; // LEGENDS FC (SSPSLT0015)
  const originalPrice = 20;

  // Revert team_players table
  await sql`DELETE FROM team_players WHERE player_id = ${replacementPlayerId} AND season_id = ${seasonId}`;
  
  const exists = await sql`SELECT * FROM team_players WHERE player_id = ${originalPlayerId} AND season_id = ${seasonId}`;
  if (exists.length === 0) {
    await sql`
      INSERT INTO team_players (team_id, player_id, season_id, round_id, purchase_price, acquired_at)
      VALUES (${teamId}, ${originalPlayerId}, ${seasonId}, 'SSPSLFR00024', ${originalPrice}, NOW())
    `;
  }
  
  // Revert footballplayers statuses
  await sql`
    UPDATE footballplayers 
    SET is_sold = true, team_id = ${teamId}, team_name = 'LEGENDS FC', acquisition_value = ${originalPrice}, 
        season_id = ${seasonId}, round_id = 'SSPSLFR00024', status = 'active'
    WHERE id = ${originalPlayerId}
  `;
  
  await sql`
    UPDATE footballplayers 
    SET is_sold = false, team_id = null, team_name = null, acquisition_value = null, status = null, round_id = null
    WHERE id = ${replacementPlayerId}
  `;
  
  // Revert round_players statuses
  await sql`
    UPDATE round_players 
    SET status = 'sold', winning_team_id = ${teamId}, winning_bid = ${originalPrice}
    WHERE round_id = 'SSPSLFR00024' AND player_id = ${originalPlayerId}
  `;
  
  await sql`
    UPDATE round_players 
    SET status = 'unsold', winning_team_id = null, winning_bid = null
    WHERE round_id = 'SSPSLFR00024' AND player_id = ${replacementPlayerId}
  `;
  
  // Revert Neon team budget (should be 110.00 for LEGENDS FC)
  await sql`
    UPDATE teams 
    SET football_budget = 110.00, football_spent = 20.00 
    WHERE id = ${teamId} AND season_id = ${seasonId}
  `;
  
  // Revert Firestore team_seasons budget
  const tsRef = adminDb.collection('team_seasons').doc(`${teamId}_${seasonId}`);
  await tsRef.update({
    football_budget: 110.00,
    football_spent: 20.00,
    total_spent: 20.00,
    'position_counts.GK': 1
  });
  
  // Delete the transaction of Peter Gulacsi and add Joan García transaction if missing
  const txnsSnapshot = await adminDb.collection('transactions')
    .where('team_id', '==', teamId)
    .where('seasonId', '==', seasonId)
    .get();
    
  for (const doc of txnsSnapshot.docs) {
    const m = doc.data().metadata || {};
    if (m.playerId === replacementPlayerId || m.replacedPlayerId === originalPlayerId) {
      await doc.ref.delete();
      console.log(`🗑️ Deleted test transaction: ${doc.id}`);
    }
  }

  console.log('✅ Revert state completed cleanly.');
}

main().catch(console.error);
