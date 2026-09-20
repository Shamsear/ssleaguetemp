import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * Revert a fixture's results from team stats for both participating teams.
 * Removes the fixture from `processed_fixtures` and recalculates:
 * - matches_played, wins, draws, losses
 * - goals_for, goals_against, goal_difference
 * - points, current_form, win_streak, unbeaten_streak
 */
export async function revertTeamStatsForFixture(params: {
  fixtureId: string;
  seasonId: string;
  tournamentId: string;
  homeTeamId: string;
  awayTeamId: string;
  customDb?: any;
}) {
  const sql = params.customDb || getTournamentDb();
  const { fixtureId, seasonId, tournamentId, homeTeamId, awayTeamId } = params;

  const teamIds = [homeTeamId, awayTeamId].filter(Boolean);

  for (const teamId of teamIds) {
    const statsId = `${teamId}_${seasonId}_${tournamentId}`;
    const rows = await sql`
      SELECT * FROM teamstats 
      WHERE id = ${statsId} 
      LIMIT 1
    `;

    if (rows.length === 0) continue;

    const current = rows[0];
    const processedFixtures = current.processed_fixtures || [];
    const remaining = processedFixtures.filter((f: any) => f.fixture_id !== fixtureId);

    // If fixture was not in processed_fixtures, nothing to revert for this team
    if (remaining.length === processedFixtures.length) continue;

    const matches_played = remaining.length;
    const wins = remaining.filter((f: any) => f.won).length;
    const draws = remaining.filter((f: any) => f.draw).length;
    const losses = remaining.filter((f: any) => f.lost).length;
    const goals_for = remaining.reduce((sum: number, f: any) => sum + (Number(f.goals_for) || 0), 0);
    const goals_against = remaining.reduce((sum: number, f: any) => sum + (Number(f.goals_against) || 0), 0);
    const goal_difference = goals_for - goals_against;
    const points = (wins * 3) + draws - (Number(current.points_deducted) || 0);
    const current_form = remaining.slice(-5).map((f: any) => f.won ? 'W' : f.draw ? 'D' : 'L').join('');

    let win_streak = 0;
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i].won) win_streak++;
      else break;
    }

    let unbeaten_streak = 0;
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i].won || remaining[i].draw) unbeaten_streak++;
      else break;
    }

    await sql`
      UPDATE teamstats
      SET
        matches_played = ${matches_played},
        wins = ${wins},
        draws = ${draws},
        losses = ${losses},
        goals_for = ${goals_for},
        goals_against = ${goals_against},
        goal_difference = ${goal_difference},
        points = ${points},
        current_form = ${current_form},
        win_streak = ${win_streak},
        unbeaten_streak = ${unbeaten_streak},
        processed_fixtures = ${JSON.stringify(remaining)}::jsonb,
        updated_at = NOW()
      WHERE id = ${statsId}
    `;

    console.log(`✓ Reverted teamstats for team ${teamId} (fixture: ${fixtureId})`);
  }

  // Recalculate positions
  if (tournamentId) {
    await recalculatePositions(seasonId, tournamentId, sql);
  }
}

/**
 * Recalculate standings positions for all teams in a tournament
 */
export async function recalculatePositions(seasonId: string, tournamentId: string, customDb?: any) {
  const sql = customDb || getTournamentDb();

  const teams = await sql`
    SELECT id, points, goal_difference, goals_for
    FROM teamstats
    WHERE season_id = ${seasonId}
      AND tournament_id = ${tournamentId}
    ORDER BY 
      points DESC,
      goal_difference DESC,
      goals_for DESC
  `;

  for (let i = 0; i < teams.length; i++) {
    const position = i + 1;
    await sql`
      UPDATE teamstats
      SET position = ${position}
      WHERE id = ${teams[i].id}
    `;
  }

  console.log(`✓ Recalculated standings positions for ${teams.length} teams in tournament ${tournamentId}`);
}
