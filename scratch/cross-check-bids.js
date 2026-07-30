const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function crossCheck() {
  const tournamentSql = neon(process.env.NEON_TOURNAMENT_DB_URL);
  const auctionSql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  
  try {
    console.log("=== FETCHING WINNING BIDS ===");
    const wonBids = await auctionSql`
      SELECT id, round_id, team_id, team_name, player_id, status, season_id, amount
      FROM bids
      WHERE status = 'won' AND season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    console.log(`Found ${wonBids.length} winning bids in bids table.`);

    console.log("=== FETCHING TEAM PLAYERS (ROSTERS) ===");
    const teamPlayers = await auctionSql`
      SELECT id, team_id, player_id, season_id, purchase_price
      FROM team_players
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    console.log(`Found ${teamPlayers.length} team_players records.`);

    console.log("=== FETCHING PLAYER HISTORY ===");
    const history = await auctionSql`
      SELECT id, player_id, team_id, team_name, season_id, status, acquisition_type, acquisition_value, end_reason
      FROM player_history
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ORDER BY acquisition_date ASC
    `;
    console.log(`Found ${history.length} player_history records.`);

    // Map won bids by player_id + season_id
    const wonBidsMap = new Map();
    wonBids.forEach(b => {
      const key = `${b.player_id}_${b.season_id}`.toLowerCase();
      wonBidsMap.set(key, b);
    });

    // Map team players by player_id + season_id
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

    // Check every winning bid
    for (const bid of wonBids) {
      const key = `${bid.player_id}_${bid.season_id}`.toLowerCase();
      const roster = teamPlayersMap.get(key);
      const histRecords = historyMap.get(key) || [];

      // Fetch player name from footballplayers to make report readable
      const fp = await auctionSql`SELECT name FROM footballplayers WHERE id = ${bid.player_id} OR player_id = ${bid.player_id} LIMIT 1`;
      const playerName = fp[0]?.name || `Player ${bid.player_id}`;

      // 1. Check Roster alignment
      if (!roster) {
        missingRoster.push({
          player_id: bid.player_id,
          player_name: playerName,
          season_id: bid.season_id,
          bid_team: bid.team_name,
          bid_team_id: bid.team_id
        });
      } else if (roster.team_id !== bid.team_id) {
        mismatches.push({
          type: 'Roster Mismatch',
          player_id: bid.player_id,
          player_name: playerName,
          season_id: bid.season_id,
          expected_team_id: bid.team_id,
          expected_team_name: bid.team_name,
          actual_team_id: roster.team_id,
          details: `Roster table has team "${roster.team_id}", but winning bid was team "${bid.team_id}" (${bid.team_name})`
        });
      }

      // 2. Check History alignment
      if (histRecords.length === 0) {
        missingHistory.push({
          player_id: bid.player_id,
          player_name: playerName,
          season_id: bid.season_id,
          bid_team: bid.team_name,
          bid_team_id: bid.team_id
        });
      } else {
        // The first history record for this season should be the acquisition from the winning bid
        const firstHist = histRecords[0];
        if (firstHist.team_id !== bid.team_id) {
          mismatches.push({
            type: 'History Mismatch',
            player_id: bid.player_id,
            player_name: playerName,
            season_id: bid.season_id,
            expected_team_id: bid.team_id,
            expected_team_name: bid.team_name,
            actual_team_id: firstHist.team_id,
            details: `History start records team "${firstHist.team_id}" (${firstHist.team_name}), but winning bid was team "${bid.team_id}" (${bid.team_name})`
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
