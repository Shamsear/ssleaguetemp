import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
  const t = line.trim();
  if (t && !t.startsWith('#')) {
    const idx = t.indexOf('=');
    if (idx !== -1) {
      let v = t.substring(idx + 1).trim().replace(/^['\"]|['\"]$/g, '');
      process.env[t.substring(0, idx).trim()] = v;
    }
  }
});

import { fantasySql } from './neon/fantasy-config';

async function generateFullReport() {
  const leagueId = 'SSPSLFLS18';

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

  // 2. Overall Cumulative Standings
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

  console.log('=== OVERALL FANTASY LEAGUE STANDINGS (Rounds 1 to ' + maxCompletedRound + ') ===');
  console.log(JSON.stringify({
    completedRounds,
    maxCompletedRound,
    standings: overallStandings.map((s, idx) => ({
      rank: idx + 1,
      team_name: s.team_name,
      owner: s.owner_name,
      player_points: Number(s.player_points),
      passive_points: Number(s.passive_points),
      total_points: Number(s.total_points),
      budget: Number(s.budget_remaining)
    }))
  }, null, 2));

  // 3. Round-by-round points breakdown
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

  const roundWise: Record<number, any[]> = {};
  for (const r of completedRounds) {
    const rows = roundPointsData.filter((d: any) => Number(d.round_number) === r);
    roundWise[r] = rows.map((row: any, idx: number) => ({
      pos: idx + 1,
      team_name: row.team_name,
      round_total: Number(row.round_total),
      player_pts: Number(row.player_pts),
      passive_pts: Number(row.passive_pts)
    }));
  }

  console.log('\n=== ROUND-WISE POINTS ===');
  console.log(JSON.stringify(roundWise, null, 2));

  // 4. Window summaries
  const windows = await fantasySql`
    SELECT window_id, window_name, start_round, end_round, status
    FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
    ORDER BY opens_at ASC
  `;

  const windowSummaries: any[] = [];
  for (const win of windows) {
    const sR = win.start_round;
    const eR = win.end_round;
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

    windowSummaries.push({
      window_name: win.window_name,
      rounds: `R${sR} - R${eR}`,
      rankings: winPoints.map((wp: any, idx: number) => ({
        rank: idx + 1,
        team_name: wp.team_name,
        window_total: Number(wp.window_total),
        player_pts: Number(wp.player_pts),
        passive_pts: Number(wp.passive_pts)
      }))
    });
  }

  console.log('\n=== WINDOW-WISE SUMMARIES ===');
  console.log(JSON.stringify(windowSummaries, null, 2));

  // Initial window: Rounds 1 to 6
  const initialPoints = await fantasySql`
    WITH p_pts AS (
      SELECT team_id, SUM(total_points) as pts
      FROM fantasy_player_points
      WHERE league_id = ${leagueId} AND round_number >= 1 AND round_number <= 6
      GROUP BY team_id
    ),
    pas_pts AS (
      SELECT team_id, SUM(total_bonus) as pts
      FROM fantasy_team_bonus_points
      WHERE league_id = ${leagueId} AND round_number >= 1 AND round_number <= 6
      GROUP BY team_id
    )
    SELECT 
      ft.team_name,
      COALESCE(p.pts, 0)::numeric as player_pts,
      COALESCE(pas.pts, 0)::numeric as passive_pts,
      (COALESCE(p.pts, 0) + COALESCE(pas.pts, 0))::numeric as initial_total
    FROM fantasy_teams ft
    LEFT JOIN p_pts p ON ft.team_id = p.team_id
    LEFT JOIN pas_pts pas ON ft.team_id = pas.team_id
    WHERE ft.league_id = ${leagueId}
    ORDER BY initial_total DESC
  `;

  console.log('\n=== INITIAL PERIOD (Rounds 1 - 6) ===');
  console.log(JSON.stringify(initialPoints.map((ip: any, idx: number) => ({
    rank: idx + 1,
    team_name: ip.team_name,
    total: Number(ip.initial_total),
    player_pts: Number(ip.player_pts),
    passive_pts: Number(ip.passive_pts)
  })), null, 2));
}

generateFullReport().catch(console.error);
