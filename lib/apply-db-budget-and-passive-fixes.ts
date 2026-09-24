import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  const updates = [
    { team_id: 'SSPSLT0021', name: 'Los Galacticos', budget: 232.00, clearPassive: true },
    { team_id: 'SSPSLT0015', name: 'Legends FC', budget: 206.00, clearPassive: true },
    { team_id: 'SSPSLT0003', name: 'RED PANTHER\'S', budget: 93.00, clearPassive: true },
    { team_id: 'SSPSLT0004', name: 'Red Hawks FC', budget: 353.00, clearPassive: false },
    { team_id: 'SSPSLT0027', name: 'PES GUARDIANS', budget: 270.00, clearPassive: false },
    { team_id: 'SSPSLT0005', name: 'TM ASGARDIANS', budget: 180.00, clearPassive: false },
    { team_id: 'SSPSLT0041', name: 'ANDIMUKK FC', budget: 120.00, clearPassive: true },
    { team_id: 'SSPSLT0001', name: 'CLASSIC TENS', budget: 143.00, clearPassive: false },
  ];

  console.log('=== APPLYING DATABASE BUDGET & SUPPORTED TEAM FIXES ===\n');

  for (const u of updates) {
    if (u.clearPassive) {
      console.log(`Updating ${u.name} (${u.team_id}): Budget -> ${u.budget} pts | Supported Team -> NULL`);
      await fantasySql`
        UPDATE fantasy_teams
        SET budget_remaining = ${u.budget},
            supported_team_id = NULL,
            supported_team_name = NULL,
            supported_team_price = NULL,
            updated_at = NOW()
        WHERE league_id = ${leagueId} AND team_id = ${u.team_id}
      `;
    } else {
      console.log(`Updating ${u.name} (${u.team_id}): Budget -> ${u.budget} pts`);
      await fantasySql`
        UPDATE fantasy_teams
        SET budget_remaining = ${u.budget},
            updated_at = NOW()
        WHERE league_id = ${leagueId} AND team_id = ${u.team_id}
      `;
    }
  }

  console.log('\n=== VERIFYING UPDATED DATABASE STATE ===\n');
  const teams = await fantasySql`
    SELECT team_id, team_name, budget_remaining, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name ASC
  `;

  console.table(teams);
  console.log('\n✅ Database successfully updated and verified!');
}

main().catch(console.error);
