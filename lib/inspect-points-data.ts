import { fantasySql } from './neon/fantasy-config';

async function checkAll() {
  const tables = await fantasySql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name ASC
  `;
  console.log('All Tables:');
  console.log(tables.map((t: any) => t.table_name));

  const leagueId = 'SSPSLFLS18';

  // Check fantasy_team_points
  const teamPoints = await fantasySql`
    SELECT * FROM fantasy_team_points ORDER BY round_number ASC, total_points DESC
  `;
  console.log(`\nfantasy_team_points rows: ${teamPoints.length}`);
  if (teamPoints.length > 0) {
    console.table(teamPoints.slice(0, 20));
  }

  // Check fantasy_player_points
  const playerPoints = await fantasySql`
    SELECT round_number, COUNT(*) as count, SUM(total_points) as sum_points 
    FROM fantasy_player_points 
    WHERE league_id = ${leagueId}
    GROUP BY round_number
    ORDER BY round_number ASC
  `;
  console.log('\nfantasy_player_points grouped by round_number:');
  console.table(playerPoints);

  // Check fantasy_teams
  const teams = await fantasySql`
    SELECT team_id, team_name, owner_name, budget_remaining, total_points, current_rank, supported_team_id
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY total_points DESC, team_name ASC
  `;
  console.log('\nfantasy_teams standings:');
  console.table(teams);

  // Check transfer windows
  const windows = await fantasySql`
    SELECT window_id, window_name, start_round, end_round, status, is_active
    FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
    ORDER BY opens_at ASC
  `;
  console.log('\nTransfer windows:');
  console.table(windows);
}

checkAll().catch(console.error);
