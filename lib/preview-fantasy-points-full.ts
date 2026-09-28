import { fantasySql } from './neon/fantasy-config';

async function generatePreview() {
  const leagueId = 'SSPSLFLS18';

  console.log('================================================================');
  console.log('              FANTASY LEAGUE POINTS PREVIEW CHECK              ');
  console.log('================================================================\n');

  // 1. Identify completed rounds
  const roundsData = await fantasySql`
    SELECT DISTINCT round_number
    FROM (
      SELECT round_number FROM fantasy_player_points WHERE league_id = ${leagueId}
      UNION
      SELECT round_number FROM fantasy_team_bonus_points WHERE league_id = ${leagueId}
    ) combined
    ORDER BY round_number ASC
  `;
  const completedRounds = roundsData.map((r: any) => Number(r.round_number));
  const maxCompletedRound = completedRounds.length > 0 ? Math.max(...completedRounds) : 0;

  console.log(`🏆 Completed Tournament Rounds Logged: ${completedRounds.join(', ') || 'None'}`);
  console.log(`📊 Latest Completed Round: Round ${maxCompletedRound}\n`);

  // 2. Fetch all teams
  const teams = await fantasySql`
    SELECT team_id, team_name, owner_name, budget_remaining, supported_team_id
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name ASC
  `;

  // 3. Overall Cumulative Standings up to latest completed round
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

  console.log('================================================================');
  console.log('              OVERALL FANTASY LEADERBOARD STANDINGS             ');
  console.log('================================================================');
  console.table(overallStandings.map((s, idx) => ({
    Rank: idx + 1,
    'Team Name': s.team_name,
    'Player Pts': Number(s.player_points),
    'Passive Pts': Number(s.passive_points),
    'Total Points': Number(s.total_points),
    Budget: `₹${s.budget_remaining} Cr`
  })));

  // 4. Round-by-round points matrix
  console.log('\n================================================================');
  console.log('              ROUND-BY-ROUND POINTS BREAKDOWN MATRIX            ');
  console.log('================================================================');

  const roundPointsData = await fantasySql`
    WITH rd_player AS (
      SELECT team_id, round_number, SUM(total_points) as p_pts
      FROM fantasy_player_points
      WHERE league_id = ${leagueId}
      GROUP BY team_id, round_number
    ),
    rd_passive AS (
      SELECT team_id, round_number, SUM(total_bonus) as pas_pts
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId}
      GROUP BY team_id, round_number
    )
    SELECT 
      ft.team_name,
      ft.team_id,
      r.round_number,
      COALESCE(rp.p_pts, 0)::numeric as player_pts,
      COALESCE(rpas.pas_pts, 0)::numeric as passive_pts,
      (COALESCE(rp.p_pts, 0) + COALESCE(rpas.pas_pts, 0))::numeric as round_total
    FROM fantasy_teams ft
    CROSS JOIN (SELECT DISTINCT round_number FROM fantasy_player_points WHERE league_id = ${leagueId}) r
    LEFT JOIN rd_player rp ON ft.team_id = rp.team_id AND r.round_number = rp.round_number
    LEFT JOIN rd_passive rpas ON ft.team_id = rpas.team_id AND r.round_number = rpas.round_number
    WHERE ft.league_id = ${leagueId}
    ORDER BY r.round_number ASC, round_total DESC
  `;

  // Display each round's table
  for (const rNum of completedRounds) {
    const roundRows = roundPointsData.filter((d: any) => Number(d.round_number) === rNum);
    if (roundRows.length > 0) {
      console.log(`\n--- ROUND ${rNum} SCORES ---`);
      console.table(roundRows.map((row: any, idx: number) => ({
        Pos: idx + 1,
        Team: row.team_name,
        'Round Total': Number(row.round_total),
        'Players Pts': Number(row.player_pts),
        'Supported Team Pts': Number(row.passive_pts)
      })));
    }
  }

  // 5. Transfer Windows breakdown (e.g. Window 1: R1-R6 / R7-R11, Window 2: R12-R17 / R18-R22)
  console.log('\n================================================================');
  console.log('             WINDOW-WISE AGGREGATE SUMMARY                      ');
  console.log('================================================================');

  const windows = await fantasySql`
    SELECT window_id, window_name, start_round, end_round, status
    FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
    ORDER BY opens_at ASC
  `;

  for (const win of windows) {
    const sR = win.start_round;
    const eR = win.end_round;
    const winRounds = completedRounds.filter(r => r >= sR && r <= eR);
    if (winRounds.length > 0) {
      const winPoints = await fantasySql`
        WITH p_pts AS (
          SELECT team_id, SUM(total_points) as pts
          FROM fantasy_player_points
          WHERE league_id = ${leagueId} AND round_number >= ${sR} AND round_number <= ${eR}
          GROUP BY team_id
        ),
        pas_pts AS (
          SELECT team_id, SUM(total_bonus) as pts
          FROM fantasy_team_bonus_points
          WHERE league_id = ${leagueId} AND round_number >= ${sR} AND round_number <= ${eR}
          GROUP BY team_id
        )
        SELECT 
          ft.team_name,
          COALESCE(p.pts, 0)::numeric as player_pts,
          COALESCE(pas.pts, 0)::numeric as passive_pts,
          (COALESCE(p.pts, 0) + COALESCE(pas.pts, 0))::numeric as window_total
        FROM fantasy_teams ft
        LEFT JOIN p_pts p ON ft.team_id = p.team_id
        LEFT JOIN pas_pts pas ON ft.team_id = pas.team_id
        WHERE ft.league_id = ${leagueId}
        ORDER BY window_total DESC
      `;

      console.log(`\nWindow: "${win.window_name}" (Rounds ${sR} to ${eR}) - [${winRounds.length} rounds completed: ${winRounds.join(', ')}]`);
      console.table(winPoints.map((wp: any, idx: number) => ({
        Rank: idx + 1,
        Team: wp.team_name,
        'Window Total': Number(wp.window_total),
        'Player Pts': Number(wp.player_pts),
        'Passive Pts': Number(wp.passive_pts)
      })));
    }
  }

  // 6. Top 10 Individual Player Performances
  const topPlayers = await fantasySql`
    SELECT 
      fp.player_name,
      fp.team_name as real_team,
      fp.category,
      COALESCE(SUM(fpp.total_points), 0)::numeric as total_fantasy_points,
      COUNT(fpp.id) as appearances
    FROM fantasy_player_points fpp
    JOIN fantasy_players fp ON (fpp.real_player_id = fp.real_player_id OR fpp.real_player_id = fp.id::text)
    WHERE fpp.league_id = ${leagueId}
    GROUP BY fp.player_name, fp.team_name, fp.category
    ORDER BY total_fantasy_points DESC
    LIMIT 10
  `;
  console.log('\n================================================================');
  console.log('              TOP 10 FANTASY PLAYERS (ALL ROUNDS)              ');
  console.log('================================================================');
  console.table(topPlayers.map((p, idx) => ({
    Rank: idx + 1,
    Player: p.player_name,
    Team: p.real_team,
    Category: p.category,
    'Matches Scored': p.appearances,
    'Total Fantasy Points': Number(p.total_fantasy_points)
  })));
}

generatePreview().catch(console.error);
