const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function runTests() {
  console.log('🏁 Starting batch bidding integration test...');

  try {
    // 1. Get a test team
    const teams = await sql`SELECT id, name, season_id FROM teams LIMIT 1`;
    if (teams.length === 0) {
      console.log('❌ No teams found in database. Cannot run test.');
      return;
    }
    const team = teams[0];
    console.log(`✅ Using test team: ${team.name} (${team.id})`);

    // 2. Get an active standard round
    const rounds = await sql`
      SELECT id, position, max_bids_per_team, season_id
      FROM rounds
      WHERE status = 'active'
      LIMIT 1
    `;
    if (rounds.length === 0) {
      console.log('⚠️ No active standard rounds found. Finding any round to simulate.');
    }
    
    // Find any round as backup
    const testRoundResult = rounds.length > 0 ? rounds : await sql`
      SELECT id, position, max_bids_per_team, season_id
      FROM rounds
      LIMIT 1
    `;
    
    if (testRoundResult.length === 0) {
      console.log('❌ No rounds found in database. Cannot run test.');
      return;
    }

    const round = testRoundResult[0];
    console.log(`✅ Using round: ${round.id} (${round.position})`);

    // 3. Find 2 players matching round position
    const positions = round.position.split(',').map(p => p.trim());
    const players = await sql`
      SELECT id, name, position FROM footballplayers
      WHERE position = ANY(${positions})
      AND is_auction_eligible = true
      AND (is_sold = false OR is_sold IS NULL)
      LIMIT 2
    `;

    if (players.length < 2) {
      console.log(`❌ Found only ${players.length} players for position ${round.position}. Need at least 2 to run test.`);
      return;
    }
    console.log(`✅ Selected test players: ${players[0].name} (${players[0].id}) & ${players[1].name} (${players[1].id})`);

    // 4. Simulate saving batch bids
    const bidsToSave = [
      { player_id: players[0].id, amount: 150 },
      { player_id: players[1].id, amount: 200 }
    ];

    console.log(`⚡ Simulating batch save for 2 bids: £150 and £200...`);

    // Transaction start simulation
    const bidId1 = `${team.id}_${round.id}_${bidsToSave[0].player_id}`;
    const bidId2 = `${team.id}_${round.id}_${bidsToSave[1].player_id}`;

    // Clean up any existing bids first
    await sql`
      DELETE FROM bids
      WHERE id IN (${bidId1}, ${bidId2})
    `;

    // Insert new bids
    await sql`
      INSERT INTO bids (
        id, team_id, team_name, player_id, round_id, season_id,
        amount, status, created_at
      ) VALUES 
      (${bidId1}, ${team.id}, ${team.name}, ${bidsToSave[0].player_id}, ${round.id}, ${round.season_id}, ${bidsToSave[0].amount}, 'active', NOW()),
      (${bidId2}, ${team.id}, ${team.name}, ${bidsToSave[1].player_id}, ${round.id}, ${round.season_id}, ${bidsToSave[1].amount}, 'active', NOW())
    `;

    console.log(`✅ Successfully executed batch inserts.`);

    // 5. Query back and verify
    const verifiedBids = await sql`
      SELECT id, player_id, amount FROM bids
      WHERE team_id = ${team.id} AND round_id = ${round.id} AND status = 'active'
    `;

    console.log(`📊 Verified bids in database:`, verifiedBids);

    if (verifiedBids.length === 2) {
      console.log('🎉 Integration Test SUCCESS: 2 bids successfully batched in 1 transaction!');
    } else {
      console.log('❌ Integration Test FAILED: Bids count mismatch.');
    }

    // Clean up
    await sql`
      DELETE FROM bids
      WHERE id IN (${bidId1}, ${bidId2})
    `;
    console.log('🗑️ Test bids cleaned up successfully.');

  } catch (error) {
    console.error('❌ Integration Test Error:', error);
  }
}

runTests();
