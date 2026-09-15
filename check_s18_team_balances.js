const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
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

async function checkBalances() {
  const seasonId = 'SSPSLS18';

  console.log('='.repeat(95));
  console.log(`CHECKING S18 BALANCES FOR 12 TEAMS IN MAIN DB (teams & team_seasons)`);
  console.log(`Season: ${seasonId}`);
  console.log('='.repeat(95));

  // 1. Fetch the 12 team_seasons for S18
  const teamSeasons = await mainSql`
    SELECT 
      id,
      team_id,
      team_name,
      season_id,
      football_budget,
      football_spent,
      players_count,
      football_players_count,
      raw_data
    FROM team_seasons
    WHERE season_id = ${seasonId}
    ORDER BY team_id ASC
  `;

  const s18TeamIds = teamSeasons.map(ts => ts.team_id);

  // 2. Fetch corresponding teams from teams table in Main DB
  const teams = await mainSql`
    SELECT 
      id,
      team_id,
      team_name,
      balance,
      initial_balance,
      total_spent,
      football_budget,
      football_spent,
      season_id,
      raw_data
    FROM teams
    WHERE id = ANY(${s18TeamIds}) OR team_id = ANY(${s18TeamIds})
    ORDER BY id ASC
  `;

  const teamsMap = new Map();
  teams.forEach(t => {
    teamsMap.set(t.id, t);
    if (t.team_id) teamsMap.set(t.team_id, t);
  });

  // 3. Fetch all release transactions for S18
  const releaseTransactions = await mainSql`
    SELECT 
      id,
      team_id,
      season_id,
      type,
      amount,
      currency,
      balance_after,
      description,
      player_name,
      created_at,
      raw_data
    FROM transactions
    WHERE season_id = ${seasonId} 
      AND (type ILIKE '%release%' OR description ILIKE '%release%')
    ORDER BY created_at ASC
  `;

  // Group release transactions by team
  const releasesByTeam = new Map();
  s18TeamIds.forEach(id => releasesByTeam.set(id, []));
  releaseTransactions.forEach(tx => {
    const list = releasesByTeam.get(tx.team_id) || [];
    list.push(tx);
    releasesByTeam.set(tx.team_id, list);
  });

  // 4. Detailed analysis per team
  console.log('\n--- 1. TEAM-BY-TEAM RELEASE BREAKDOWN ---');
  for (const teamId of s18TeamIds) {
    const ts = teamSeasons.find(t => t.team_id === teamId);
    const txs = releasesByTeam.get(teamId) || [];
    const totalRefund = txs.reduce((sum, t) => sum + Number(t.amount), 0);

    console.log(`\nTeam: ${teamId} - ${ts?.team_name}`);
    if (txs.length === 0) {
      console.log('  No players released.');
    } else {
      console.log(`  Total Releases: ${txs.length} | Total eCoin (Football) Refund: ${totalRefund}`);
      txs.forEach((t, i) => {
        const pName = t.player_name || t.description?.replace(/Released\s+/i, '').split('-')[0].trim() || 'Unknown';
        console.log(`    ${i + 1}. Player: ${pName} | Refund: ${t.amount} eCoin | Recorded BalAfter: ${t.balance_after}`);
      });
    }
  }

  // 5. Comparison table between `teams` and `team_seasons`
  console.log('\n--- 2. BALANCE COMPARISON: teams vs team_seasons (MAIN DB) ---');
  const comparisonData = s18TeamIds.map(teamId => {
    const ts = teamSeasons.find(t => t.team_id === teamId);
    const t = teamsMap.get(teamId);
    const txs = releasesByTeam.get(teamId) || [];
    const totalRefund = txs.reduce((sum, tx) => sum + Number(tx.amount), 0);

    const tsFootballBudget = ts?.football_budget !== null ? Number(ts?.football_budget) : null;
    const teamFootballBudget = t?.football_budget !== null ? Number(t?.football_budget) : null;
    const teamBalance = t?.balance !== null ? Number(t?.balance) : null;

    // Discrepancy check:
    // Does team_seasons.football_budget equal the release refund?
    // Does teams.football_budget match team_seasons.football_budget?
    const inSync = (teamFootballBudget !== null && teamFootballBudget === tsFootballBudget);

    return {
      'Team ID': teamId,
      'Team Name': ts?.team_name || t?.team_name || 'Unknown',
      'Releases': txs.length,
      'Total Refund': totalRefund,
      'team_seasons fb_budget': tsFootballBudget,
      'teams fb_budget': teamFootballBudget,
      'teams balance': teamBalance,
      'In Sync?': inSync ? '✅ YES' : '❌ MISMATCH'
    };
  });

  console.table(comparisonData);

  // 6. Summary of Findings
  console.log('\n--- 3. FINDINGS & VERIFICATION SUMMARY ---');
  let missingInTeamsTable = 0;
  let matchesRefund = 0;

  comparisonData.forEach(row => {
    if (row['teams fb_budget'] === null) {
      missingInTeamsTable++;
    }
    if (row['team_seasons fb_budget'] === row['Total Refund']) {
      matchesRefund++;
    }
  });

  console.log(`• Total S18 Teams: ${s18TeamIds.length}`);
  console.log(`• Total Release Transactions Found: ${releaseTransactions.length}`);
  console.log(`• Teams where team_seasons.football_budget == Total Release Refund: ${matchesRefund} / ${s18TeamIds.length}`);
  console.log(`• Teams where teams.football_budget is NULL / unsynced with team_seasons: ${missingInTeamsTable} / ${s18TeamIds.length}`);

  if (missingInTeamsTable > 0) {
    console.log(`\n⚠️ NOTE: In Main DB, the 'teams' table has football_budget = NULL for almost all teams, while 'team_seasons' holds the active season football_budget (${seasonId}).`);
  }
}

checkBalances().catch(err => console.error('Error running balance check:', err));
