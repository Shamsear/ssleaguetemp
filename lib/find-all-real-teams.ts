import { fantasySql } from './neon/fantasy-config';

async function main() {
  // Query unique real_team_name from fantasy_players
  const realTeamsFromPlayers = await fantasySql`
    SELECT DISTINCT real_team_name
    FROM fantasy_players
    WHERE league_id = 'SSPSLFLS18' AND real_team_name IS NOT NULL AND real_team_name != ''
    ORDER BY real_team_name
  `;
  console.log('Real teams from fantasy_players count:', realTeamsFromPlayers.length);
  console.table(realTeamsFromPlayers);

  // Query fantasy_teams
  const fTeams = await fantasySql`
    SELECT team_id, team_name, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = 'SSPSLFLS18'
  `;
  console.log('Fantasy Teams count:', fTeams.length);
  console.table(fTeams);
}

main().catch(console.error);
