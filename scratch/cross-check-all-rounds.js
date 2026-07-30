const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function crossCheck() {
  const auctionSql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  
  try {
    console.log("=== 1. FETCHING REGULAR ROUND WINS ===");
    const regWins = await auctionSql`
      SELECT player_id, team_id, team_name, season_id, amount as price, round_id, 'regular' as round_type
      FROM bids
      WHERE status = 'won' AND season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    console.log(`Found ${regWins.length} winning bids in regular rounds.`);

    console.log("\n=== 2. FETCHING BULK ROUND WINS ===");
    const bulkWins = await auctionSql`
      SELECT rp.player_id, rp.winning_team_id as team_id, t.name as team_name, r.season_id, rp.round_id, rp.winning_bid as price, 'bulk' as round_type
      FROM round_players rp
      JOIN rounds r ON rp.round_id = r.id
      LEFT JOIN teams t ON rp.winning_team_id = t.id
      WHERE rp.status = 'sold' AND r.season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    console.log(`Found ${bulkWins.length} winning bids in bulk rounds.`);

    // Combine regular and bulk round wins
    const allWins = [...regWins, ...bulkWins];
    console.log(`\nTotal winning allocations to verify: ${allWins.length}`);

    console.log("\n=== 3. FETCHING ROSTER AND HISTORY DATA ===");
    const teamPlayers = await auctionSql`
      SELECT id, team_id, player_id, season_id, purchase_price
      FROM team_players
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    console.log(`Found ${teamPlayers.length} team_players records.`);

    const history = await auctionSql`
      SELECT id, player_id, team_id, team_name, season_id, status, acquisition_type, acquisition_value, end_reason
      FROM player_history
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ORDER BY acquisition_date ASC
    `;
    console.log(`Found ${history.length} player_history records.`);

    // Map rosters by player_id + season_id
    const teamPlayersMap = new Map();
    teamPlayers.forEach(tp => {
      const key = `${tp.player_id}_${tp.season_id}`.toLowerCase();
      teamPlayersMap.set(key, tp);
    });

    // Map history records by player_id + season_id
    const historyMap = new Map();
    history.forEach(h => {
      const key = `${h.player_id}_${h.season_id}`.toLowerCase();
      if (!historyMap.has(key)) {
        historyMap.set(key, []);
      }
      historyMap.get(key).push(h);
    });

    const mismatches = [];
    const missingHistory = [];
    const missingRoster = [];

    // Audit every allocation win
    for (const win of allWins) {
      const key = `${win.player_id}_${win.season_id}`.toLowerCase();
      const roster = teamPlayersMap.get(key);
      const histRecords = historyMap.get(key) || [];

      // Get player name
      const fp = await auctionSql`SELECT name FROM footballplayers WHERE id = ${win.player_id} OR player_id = ${win.player_id} LIMIT 1`;
      const playerName = fp[0]?.name || `Player ${win.player_id}`;

      // 1. Audit active roster
      if (!roster) {
        missingRoster.push({
          player_id: win.player_id,
          player_name: playerName,
          season_id: win.season_id,
          expected_team_id: win.team_id,
          expected_team_name: win.team_name,
          round_type: win.round_type,
          price: win.price
        });
      } else if (roster.team_id !== win.team_id) {
        mismatches.push({
          type: 'Roster Mismatch',
          player_id: win.player_id,
          player_name: playerName,
          season_id: win.season_id,
          round_type: win.round_type,
          expected_team_id: win.team_id,
          expected_team_name: win.team_name,
          actual_team_id: roster.team_id,
          details: `Roster has team "${roster.team_id}", but winning allocation was team "${win.team_id}" (${win.team_name})`
        });
      }

      // 2. Audit history timeline
      if (histRecords.length === 0) {
        missingHistory.push({
          player_id: win.player_id,
          player_name: playerName,
          season_id: win.season_id,
          expected_team_id: win.team_id,
          expected_team_name: win.team_name,
          round_type: win.round_type,
          price: win.price
        });
      } else {
        const firstHist = histRecords[0];
        if (firstHist.team_id !== win.team_id) {
          mismatches.push({
            type: 'History Mismatch',
            player_id: win.player_id,
            player_name: playerName,
            season_id: win.season_id,
            round_type: win.round_type,
            expected_team_id: win.team_id,
            expected_team_name: win.team_name,
            actual_team_id: firstHist.team_id,
            details: `History start records team "${firstHist.team_id}" (${firstHist.team_name}), but winning allocation was team "${win.team_id}" (${win.team_name})`
          });
        }
      }
    }

    console.log("\n=== CROSS-CHECK REPORT ===");
    console.log(`Mismatches Found: ${mismatches.length}`);
    console.log(`Missing History Records: ${missingHistory.length}`);
    console.log(`Missing Roster Records: ${missingRoster.length}`);
    
    console.log("\n=== DETAILS OF MISMATCHES ===");
    console.log(JSON.stringify(mismatches, null, 2));

    console.log("\n=== DETAILS OF MISSING HISTORY ===");
    console.log(JSON.stringify(missingHistory, null, 2));

    console.log("\n=== DETAILS OF MISSING ROSTERS ===");
    console.log(JSON.stringify(missingRoster, null, 2));

  } catch (err) {
    console.error(err);
  }
}
crossCheck();
