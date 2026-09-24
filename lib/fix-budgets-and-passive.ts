import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  console.log('=== STARTING FANTASY DB CORRECTION ===\n');

  // 1. Reset supported_team_id to NULL for the 4 teams that released their passive team:
  // - Los Galacticos (SSPSLT0021)
  // - Legends FC (SSPSLT0015)
  // - RED PANTHER'S (SSPSLT0003)
  // - ANDIMUKK FC (SSPSLT0041)

  const passiveReleaseTeamIds = ['SSPSLT0021', 'SSPSLT0015', 'SSPSLT0003', 'SSPSLT0041'];

  for (const teamId of passiveReleaseTeamIds) {
    await fantasySql`
      UPDATE fantasy_teams
      SET supported_team_id = NULL,
          supported_team_name = NULL,
          supported_team_price = 0,
          updated_at = NOW()
      WHERE team_id = ${teamId}
        AND league_id = ${leagueId}
    `;
    console.log(`✅ Set supported_team = NULL for team ${teamId}`);
  }

  // 2. Recalculate remaining budgets for ALL 8 teams
  const teams = await fantasySql`
    SELECT team_id, team_name, supported_team_id, supported_team_price
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
  `;

  const squad = await fantasySql`
    SELECT team_id, purchase_price
    FROM fantasy_squad
    WHERE league_id = ${leagueId}
  `;

  const releases = await fantasySql`
    SELECT team_id, refund_amount
    FROM fantasy_releases
    WHERE league_id = ${leagueId}
  `;

  for (const t of teams) {
    const squadSpend = squad
      .filter((s: any) => s.team_id === t.team_id)
      .reduce((sum: number, s: any) => sum + Number(s.purchase_price || 0), 0);

    const passiveSpend = t.supported_team_id ? Number(t.supported_team_price || 0) : 0;

    const totalRefunds = releases
      .filter((r: any) => r.team_id === t.team_id)
      .reduce((sum: number, r: any) => sum + Number(r.refund_amount || 0), 0);

    const correctBudget = 500 - squadSpend - passiveSpend + totalRefunds;

    await fantasySql`
      UPDATE fantasy_teams
      SET budget_remaining = ${correctBudget},
          updated_at = NOW()
      WHERE team_id = ${t.team_id}
        AND league_id = ${leagueId}
    `;

    console.log(`✅ Updated ${t.team_name} budget: 500 - ${squadSpend} (squad) - ${passiveSpend} (passive) + ${totalRefunds} (refunds) = ${correctBudget} pts`);
  }

  console.log('\n=== DB CORRECTION COMPLETED SUCCESSFULLY ===');
}

main().catch(console.error);
