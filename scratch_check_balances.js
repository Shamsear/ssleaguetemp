const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
});

const { neon } = require('@neondatabase/serverless');
const mainSql = neon(process.env.NEON_MAIN_DB_URL);
const auctionSql = neon(process.env.NEON_AUCTION_DB_URL);

async function run() {
  try {
    const seasonId = 'SSPSLS18';

    // 1. Get teams from Auction DB
    const auctionTeams = await auctionSql`
      SELECT id, name, season_id, football_budget, football_spent, football_players_count
      FROM teams
      WHERE season_id = ${seasonId}
      ORDER BY id
    `;

    // 2. Get team_seasons from Main DB
    const mainTeamSeasons = await mainSql`
      SELECT id, team_id, team_name, season_id, football_budget, football_spent, 
             players_count, football_players_count, raw_data
      FROM team_seasons
      WHERE season_id = ${seasonId}
      ORDER BY team_id
    `;

    // 3. Get teams from Main DB
    const mainTeams = await mainSql`
      SELECT id, team_id, team_name, balance, initial_balance, total_spent, 
             football_budget, football_spent, season_id
      FROM teams
      ORDER BY id
    `;
    const mainTeamsMap = new Map(mainTeams.map(t => [t.id, t]));

    // 4. Get active football players per team from Auction DB
    const activePlayers = await auctionSql`
      SELECT team_id, COUNT(*) as player_count, SUM(COALESCE(acquisition_value, 0)) as total_acquisition_value
      FROM footballplayers
      WHERE season_id = ${seasonId} AND team_id IS NOT NULL AND (retired IS NOT TRUE) AND status != 'free_agent'
      GROUP BY team_id
    `;
    const activePlayersMap = new Map(activePlayers.map(p => [p.team_id, p]));

    // Also get all players in footballplayers for season 18 regardless of status
    const allSeasonPlayers = await auctionSql`
      SELECT team_id, status, is_sold, COUNT(*) as count, SUM(COALESCE(acquisition_value, 0)) as total_val
      FROM footballplayers
      WHERE season_id = ${seasonId}
      GROUP BY team_id, status, is_sold
    `;
    console.log('=== ALL SEASON PLAYERS GROUPED ===');
    console.log(allSeasonPlayers);

    // 5. Get all release transactions for SSPSLS18 from Main DB
    const releaseTxs = await mainSql`
      SELECT team_id, amount, balance_after, description, player_name, created_at, raw_data
      FROM transactions
      WHERE season_id = ${seasonId} AND (type ILIKE '%release%' OR description ILIKE '%release%')
      ORDER BY created_at ASC
    `;
    console.log(`\nFound ${releaseTxs.length} release transactions for ${seasonId}:`);
    const releasesByTeam = new Map();
    releaseTxs.forEach(tx => {
      const list = releasesByTeam.get(tx.team_id) || [];
      list.push(tx);
      releasesByTeam.set(tx.team_id, list);
    });

    console.log('\n=== RELEASES BY TEAM ===');
    for (const [teamId, txs] of releasesByTeam.entries()) {
      const totalRefund = txs.reduce((sum, t) => sum + Number(t.amount), 0);
      console.log(`Team ${teamId}: ${txs.length} releases, Total Refund: ${totalRefund}`);
      txs.forEach(t => console.log(`   - ${t.player_name}: ${t.amount} (bal_after: ${t.balance_after})`));
    }

    // 6. Summary Comparison Table
    console.log('\n=== DETAILED TEAM COMPARISON ===');
    const rows = [];
    for (const at of auctionTeams) {
      const teamId = at.id;
      const mts = mainTeamSeasons.find(t => t.team_id === teamId);
      const mt = mainTeamsMap.get(teamId);
      const ap = activePlayersMap.get(teamId) || { player_count: 0, total_acquisition_value: 0 };
      const teamReleases = releasesByTeam.get(teamId) || [];
      const totalRefund = teamReleases.reduce((sum, t) => sum + Number(t.amount), 0);

      const auctionDbBudget = Number(at.football_budget);
      const auctionDbSpent = Number(at.football_spent);
      const mainTsBudget = Number(mts?.football_budget || 0);
      const mainTsSpent = Number(mts?.football_spent || 0);
      const mainTeamBudget = mt?.football_budget;

      const squadCount = Number(ap.player_count);
      const currentSquadCost = Number(ap.total_acquisition_value);

      // Initial budget was 10,000
      // If team spent X in auction:
      // Initial spent was currentSquadCost + released_players_auction_value
      // Let's see if 10000 - currentSquadCost matches something, or if 10000 - original_spent + refund matches!
      rows.push({
        team_id: teamId,
        team_name: at.name,
        'Active Players': squadCount,
        'Squad Cost': currentSquadCost,
        'Releases Count': teamReleases.length,
        'Total Refund': totalRefund,
        'AuctionDB Budget': auctionDbBudget,
        'MainDB ts Budget': mainTsBudget,
        'MainDB teams Budget': mainTeamBudget,
        'AuctionDB Spent': auctionDbSpent,
        'MainDB ts Spent': mainTsSpent,
      });
    }
    console.table(rows);

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
