import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  console.log('=== DYNAMIC FANTASY BUDGET RECONCILIATION ENGINE ===\n');

  // 1. Initial 6-slot draft spend per team
  // Initial draft spend was audited with 100% precision:
  const initialSpendMap: Record<string, { squadSpend: number; passiveSpend: number; passiveTeamName: string }> = {
    'SSPSLT0041': { squadSpend: 440, passiveSpend: 58, passiveTeamName: 'RED PANTHERS' }, // ALIM (61), GOKU (153), SUNU (60), ANVAR (75), ADHIL (91) + RED PANTHERS (58) = 498
    'SSPSLT0027': { squadSpend: 290, passiveSpend: 83, passiveTeamName: 'FC BARCELONA' }, // 373
    'SSPSLT0003': { squadSpend: 454, passiveSpend: 45, passiveTeamName: 'PES GUARDIANS' }, // 499
    'SSPSLT0004': { squadSpend: 232, passiveSpend: 99, passiveTeamName: 'LOS GALACTICOS' }, // 331
    'SSPSLT0021': { squadSpend: 301, passiveSpend: 70, passiveTeamName: 'CLASSIC TENS' }, // 371
    'SSPSLT0015': { squadSpend: 294, passiveSpend: 162, passiveTeamName: 'LEGENDS FC' }, // 456
    'SSPSLT0005': { squadSpend: 209, passiveSpend: 151, passiveTeamName: 'TM ASGARDIANS' }, // 360
    'SSPSLT0001': { squadSpend: 345, passiveSpend: 36, passiveTeamName: 'ANDIMUKK FC' }, // 381
  };

  // 2. Fetch all refunds from fantasy_releases
  const releases = await fantasySql`
    SELECT team_id, refund_amount, is_passive_team, player_name, released_at
    FROM fantasy_releases
    WHERE league_id = ${leagueId}
  `;

  const refundsByTeam: Record<string, number> = {};
  for (const r of releases) {
    refundsByTeam[r.team_id] = (refundsByTeam[r.team_id] || 0) + Number(r.refund_amount || 0);
  }

  // 3. Fetch all won post-release bids from fantasy_post_release_bids across ALL windows
  const wonBids = await fantasySql`
    SELECT team_id, bid_amount, category, is_passive_team, target_name, draft_round_id
    FROM fantasy_post_release_bids
    WHERE league_id = ${leagueId} AND status = 'won'
  `;

  const wonSpendByTeam: Record<string, number> = {};
  for (const b of wonBids) {
    wonSpendByTeam[b.team_id] = (wonSpendByTeam[b.team_id] || 0) + Number(b.bid_amount || 0);
  }

  // 4. Fetch all teams
  const teams = await fantasySql`
    SELECT team_id, team_name, budget_remaining, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name
  `;

  console.log('Calculation Breakdown:');
  const auditedResults: any[] = [];

  for (const t of teams) {
    const initData = initialSpendMap[t.team_id] || { squadSpend: 0, passiveSpend: 0, passiveTeamName: '' };
    const totalInitialSpend = initData.squadSpend + initData.passiveSpend;
    const balanceAfterDraft = 500 - totalInitialSpend;
    const totalRefunds = refundsByTeam[t.team_id] || 0;
    const totalPostReleaseSpend = wonSpendByTeam[t.team_id] || 0;
    const calculatedBudget = balanceAfterDraft + totalRefunds - totalPostReleaseSpend;

    auditedResults.push({
      team_id: t.team_id,
      team_name: t.team_name,
      initialSpend: totalInitialSpend,
      afterDraft: balanceAfterDraft,
      refunds: totalRefunds,
      postReleaseSpend: totalPostReleaseSpend,
      calculatedBudget: Number(calculatedBudget.toFixed(2)),
      currentDb: Number(t.budget_remaining || 0),
      diff: Number((calculatedBudget - Number(t.budget_remaining || 0)).toFixed(2))
    });
  }

  console.table(auditedResults);

  console.log('\n=== APPLYING AUDITED BALANCES TO DATABASE ===\n');

  for (const res of auditedResults) {
    await fantasySql`
      UPDATE fantasy_teams
      SET budget_remaining = ${res.calculatedBudget},
          updated_at = NOW()
      WHERE league_id = ${leagueId} AND team_id = ${res.team_id}
    `;
  }

  console.log('✅ All team budgets successfully reconciled and updated in database!');

  const updatedTeams = await fantasySql`
    SELECT team_id, team_name, budget_remaining, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name
  `;
  console.log('\n=== VERIFIED UPDATED DATABASE BUDGETS ===');
  console.table(updatedTeams);
}

main().catch(console.error);
