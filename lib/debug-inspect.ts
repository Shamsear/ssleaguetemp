import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  const teams = await fantasySql`
    SELECT team_id, team_name, owner_name, supported_team_id, supported_team_name, supported_team_price, budget_remaining, total_points
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name ASC
  `;

  const squad = await fantasySql`
    SELECT s.*, ft.team_name
    FROM fantasy_squad s
    JOIN fantasy_teams ft ON ft.team_id = s.team_id
    WHERE s.league_id = ${leagueId}
    ORDER BY ft.team_name ASC, s.acquired_at ASC
  `;

  const releases = await fantasySql`
    SELECT r.*, ft.team_name as releasing_team_name
    FROM fantasy_releases r
    LEFT JOIN fantasy_teams ft ON ft.team_id = r.team_id
    WHERE r.league_id = ${leagueId}
    ORDER BY r.released_at ASC
  `;

  console.log('=====================================================');
  console.log('=== ALL 8 TEAMS DETAILED AUDIT ===');
  console.log('=====================================================\n');

  for (const t of teams) {
    const teamSquad = squad.filter((s: any) => s.team_id === t.team_id);
    const teamReleases = releases.filter((r: any) => r.team_id === t.team_id);

    let squadPriceSum = 0;
    teamSquad.forEach((s: any) => squadPriceSum += Number(s.purchase_price || 0));

    let releaseRefundSum = 0;
    teamReleases.forEach((r: any) => releaseRefundSum += Number(r.refund_amount || 0));

    const passivePrice = Number(t.supported_team_price || 0);
    const expectedBudget = 500 - squadPriceSum - passivePrice + releaseRefundSum;

    console.log(`TEAM: ${t.team_name} (ID: ${t.team_id}, Owner: ${t.owner_name})`);
    console.log(`  Current Supported Team: ${t.supported_team_name || 'NULL'} (ID: ${t.supported_team_id || 'NULL'}, Price: ${t.supported_team_price || 0})`);
    console.log(`  Squad Players (${teamSquad.length}): ${teamSquad.map((s: any) => `${s.player_name} (${s.purchase_price}pts)`).join(', ')}`);
    console.log(`  Releases (${teamReleases.length}): ${teamReleases.map((r: any) => `${r.player_name} [${r.is_passive_team ? 'PASSIVE' : 'PLAYER'}] (+${r.refund_amount}pts)`).join(', ')}`);
    console.log(`  Budget Audit: Initial 500 - Squad ${squadPriceSum} - Passive ${passivePrice} + Refunds ${releaseRefundSum} = Expected ${expectedBudget} pts | Current DB: ${t.budget_remaining} pts`);
    console.log(`-----------------------------------------------------\n`);
  }
}

main().catch(console.error);
