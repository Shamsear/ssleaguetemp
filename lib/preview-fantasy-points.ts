import { fantasySql } from './neon/fantasy-config';

async function checkFantasyPoints() {
  console.log('=== FANTASY LEAGUE POINTS PREVIEW CHECK ===\n');

  const leagueId = 'SSPSLFLS18';

  // 1. Get fantasy league settings
  const leagues = await fantasySql`SELECT * FROM fantasy_leagues WHERE league_id = ${leagueId}`;
  const league = leagues[0];
  console.log(`League: ${league?.league_name || leagueId}`);

  // 2. Check rounds and completed status
  const rounds = await fantasySql`
    SELECT id, round_number, round_name, status, is_completed
    FROM rounds
    WHERE tournament_id = ${league?.tournament_id || 'SSPSLT18'}
    ORDER BY round_number ASC
  `;
  console.log('\n--- TOURNAMENT ROUNDS ---');
  console.table(rounds.map(r => ({
    round_number: r.round_number,
    round_name: r.round_name,
    status: r.status,
    is_completed: r.is_completed
  })));

  // 3. Check fantasy transfer windows & completed rounds range
  const transferWindows = await fantasySql`
    SELECT window_id, window_name, start_round, end_round, status, is_active
    FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
    ORDER BY opens_at ASC
  `;
  console.log('\n--- FANTASY TRANSFER WINDOWS ---');
  console.table(transferWindows);

  // 4. Fetch team standings from fantasy_teams
  const teams = await fantasySql`
    SELECT 
      team_id, team_name, owner_name, budget_remaining, 
      total_points, current_rank, supported_team_id
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY total_points DESC, team_name ASC
  `;
  console.log('\n--- CURRENT FANTASY LEADERBOARD IN DB ---');
  console.table(teams.map((t, idx) => ({
    rank: idx + 1,
    team_name: t.team_name,
    owner: t.owner_name,
    total_points: t.total_points,
    budget: `₹${t.budget_remaining} Cr`,
    supported_team: t.supported_team_id || 'None'
  })));

  // 5. Round-by-round points breakdown per team
  const roundPoints = await fantasySql`
    SELECT 
      ftp.team_id,
      ft.team_name,
      ftp.round_number,
      ftp.total_points,
      ftp.base_points,
      ftp.captain_points,
      ftp.supported_team_points,
      ftp.bonus_points
    FROM fantasy_team_points ftp
    JOIN fantasy_teams ft ON ftp.team_id = ft.team_id
    WHERE ft.league_id = ${leagueId}
    ORDER BY ftp.round_number ASC, ftp.total_points DESC
  `;

  if (roundPoints.length > 0) {
    console.log(`\n--- ROUND-BY-ROUND POINTS (${roundPoints.length} records logged) ---`);
    
    // Group by round_number
    const roundsMap: Record<number, any[]> = {};
    roundPoints.forEach(rp => {
      const rNum = rp.round_number;
      if (!roundsMap[rNum]) roundsMap[rNum] = [];
      roundsMap[rNum].push(rp);
    });

    Object.keys(roundsMap).sort((a, b) => Number(a) - Number(b)).forEach(rNum => {
      console.log(`\nRound ${rNum} Standings:`);
      console.table(roundsMap[Number(rNum)].map((rp, idx) => ({
        pos: idx + 1,
        team: rp.team_name,
        round_total: rp.total_points,
        base: rp.base_points,
        captain: rp.captain_points,
        supported_team: rp.supported_team_points,
        bonus: rp.bonus_points
      })));
    });
  } else {
    console.log('\n(No records found in fantasy_team_points table yet)');
  }

  // 6. Check player points logged
  const playerPointsCount = await fantasySql`
    SELECT COUNT(*) as count FROM fantasy_player_points WHERE league_id = ${leagueId}
  `;
  console.log(`\nLogged Player Points Rows: ${playerPointsCount[0]?.count}`);
}

checkFantasyPoints().catch(console.error);
