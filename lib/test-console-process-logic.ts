import { fantasySql } from './neon/fantasy-config';

async function testConsoleProcess() {
  const leagueId = 'SSPSLFLS18';

  const allTeams = await fantasySql`
    SELECT team_id, team_name, owner_name, budget_remaining, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
  `;

  const allReleases = await fantasySql`
    SELECT fr.*, ft.team_name
    FROM fantasy_releases fr
    JOIN fantasy_teams ft ON fr.team_id = ft.team_id
    WHERE fr.league_id = ${leagueId}
  `;

  const passiveReleases = allReleases.filter((r: any) => r.is_passive_team);

  const participatingTeams = allTeams.filter((t: any) => {
    const hasPassiveRelease = passiveReleases.some((r: any) => r.team_id === t.team_id);
    const hasNoSupportedTeam = !t.supported_team_id || t.supported_team_id.trim() === '';
    return hasPassiveRelease || hasNoSupportedTeam;
  });

  console.log('=== SIMULATED CONSOLE PROCESS FOR PASSIVE TEAM (SUPPORTED TEAMS) ===');
  console.log(`Participating Teams Count: ${participatingTeams.length} Teams`);
  console.table(participatingTeams.map((t: any) => ({
    team_id: t.team_id,
    team_name: t.team_name,
    budget_remaining: t.budget_remaining,
    supported_team_id: t.supported_team_id || 'NULL (Eligible for Auction)'
  })));

  console.log(`\nReleased Targets Available Count: ${passiveReleases.length} Released Real Teams`);
  console.table(passiveReleases.map((r: any) => ({
    release_id: r.release_id,
    released_by: r.team_name,
    real_team_name: r.player_name,
    refund_amount: r.refund_amount
  })));
}

testConsoleProcess().catch(console.error);
