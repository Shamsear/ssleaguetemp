import { fantasySql } from './neon/fantasy-config';

async function printSummary() {
  const leagueId = 'SSPSLFLS18';

  const overallStandings = await fantasySql`
    WITH player_pts AS (
      SELECT team_id, COALESCE(SUM(total_points), 0) as calc_player_points
      FROM fantasy_player_points
      WHERE league_id = ${leagueId}
      GROUP BY team_id
    ),
    passive_pts AS (
      SELECT team_id, COALESCE(SUM(total_bonus), 0) as calc_passive_points
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId}
      GROUP BY team_id
    )
    SELECT 
      ft.team_id,
      ft.team_name,
      ft.owner_name,
      COALESCE(pt.calc_player_points, 0)::numeric as player_points,
      COALESCE(pas.calc_passive_points, 0)::numeric as passive_points,
      (COALESCE(pt.calc_player_points, 0) + COALESCE(pas.calc_passive_points, 0))::numeric as total_points,
      ft.budget_remaining
    FROM fantasy_teams ft
    LEFT JOIN player_pts pt ON ft.team_id = pt.team_id
    LEFT JOIN passive_pts pas ON ft.team_id = pas.team_id
    WHERE ft.league_id = ${leagueId}
    ORDER BY total_points DESC, player_points DESC, ft.team_name ASC
  `;

  console.log('=== OVERALL FANTASY STANDINGS (Rounds 1 to 19) ===');
  overallStandings.forEach((s: any, idx: number) => {
    console.log(`${idx + 1}. ${s.team_name} | Total: ${s.total_points} pts (Players: ${s.player_points} pts, Supported Team: ${s.passive_points} pts) | Budget: ₹${s.budget_remaining} Cr`);
  });

  console.log('\n=== RECENT ROUNDS SCORES ===');
  const recentRounds = [16, 17, 18, 19];
  for (const r of recentRounds) {
    const rData = await fantasySql`
      WITH rd_player AS (
        SELECT team_id, SUM(total_points) as p_pts
        FROM fantasy_player_points
        WHERE league_id = ${leagueId} AND round_number = ${r}
        GROUP BY team_id
      ),
      rd_passive AS (
        SELECT team_id, SUM(total_bonus) as pas_pts
        FROM fantasy_team_bonus_points
        WHERE league_id = ${leagueId} AND round_number = ${r}
        GROUP BY team_id
      )
      SELECT 
        ft.team_name,
        COALESCE(rp.p_pts, 0)::numeric as player_pts,
        COALESCE(rpas.pas_pts, 0)::numeric as passive_pts,
        (COALESCE(rp.p_pts, 0) + COALESCE(rpas.pas_pts, 0))::numeric as round_total
      FROM fantasy_teams ft
      LEFT JOIN rd_player rp ON ft.team_id = rp.team_id
      LEFT JOIN rd_passive rpas ON ft.team_id = rpas.team_id
      WHERE ft.league_id = ${leagueId}
      ORDER BY round_total DESC
    `;
    console.log(`\nRound ${r}:`);
    rData.forEach((row: any, idx: number) => {
      console.log(`  ${idx + 1}. ${row.team_name}: ${row.round_total} pts (Players: ${row.player_pts}, Supported Team: ${row.passive_pts})`);
    });
  }
}

printSummary().catch(console.error);
