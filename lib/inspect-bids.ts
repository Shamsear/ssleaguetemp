import { fantasySql } from './neon/fantasy-config';

async function main() {
  const fantasyTeams = await fantasySql`
    SELECT team_id, team_name, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = 'SSPSLFLS18'
  `;
  console.log('--- Fantasy Teams ---');
  console.table(fantasyTeams);

  const releases = await fantasySql`
    SELECT release_id, team_id, real_player_id, player_name, is_passive_team, window_id
    FROM fantasy_releases
    WHERE league_id = 'SSPSLFLS18'
  `;
  console.log('--- Releases ---');
  console.table(releases);
}

main().catch(console.error);
