import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';
  const teamId = 'SSPSLT0003'; // RED PANTHER'S

  console.log('=== 1. FANTASY LEAGUE CATEGORY SETTINGS ===');
  const [league] = await fantasySql`
    SELECT league_id, category_settings FROM fantasy_leagues WHERE league_id = ${leagueId}
  `;
  console.log(JSON.stringify(league?.category_settings, null, 2));

  console.log('\n=== 2. DRAFT ROUNDS ===');
  const rounds = await fantasySql`
    SELECT id, slot_index, slot_name, status, opens_at, closes_at
    FROM fantasy_draft_rounds
    WHERE league_id = ${leagueId}
    ORDER BY slot_index
  `;
  console.table(rounds);

  console.log('\n=== 3. RELEASES FOR RED PANTHER\'S ===');
  const releases = await fantasySql`
    SELECT release_id, team_id, real_player_id, player_name, category, is_passive_team, window_id, released_at
    FROM fantasy_releases
    WHERE league_id = ${leagueId} AND team_id = ${teamId}
  `;
  console.table(releases);

  console.log('\n=== 4. RED PANTHER\'S TEAM STATE ===');
  const [team] = await fantasySql`
    SELECT team_id, team_name, supported_team_id, supported_team_name, budget_remaining
    FROM fantasy_teams
    WHERE league_id = ${leagueId} AND team_id = ${teamId}
  `;
  console.log(team);
}

main().catch(console.error);
