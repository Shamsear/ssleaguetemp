import { fantasySql } from './neon/fantasy-config';

async function checkSupportedTeams() {
  const leagueId = 'SSPSLFLS18';

  const teams = await fantasySql`
    SELECT team_id, team_name, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
  `;

  console.log('=== FANTASY TEAMS SUPPORTED TEAM STATUS ===');
  console.table(teams);

  const releases = await fantasySql`
    SELECT release_id, team_id, real_player_id, player_name, is_passive_team
    FROM fantasy_releases
    WHERE league_id = ${leagueId} AND is_passive_team = true
  `;

  console.log('\n=== LOGGED PASSIVE RELEASES ===');
  console.table(releases);
}

checkSupportedTeams().catch(console.error);
