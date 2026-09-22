import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

async function getPlayerCategoriesMap(sql: any, seasonId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!seasonId) return map;

  try {
    const ps = await sql`
      SELECT player_id, player_name, category
      FROM player_seasons
      WHERE season_id = ${seasonId}
    `;
    ps.forEach((p: any) => {
      if (p.player_id && p.category) map.set(p.player_id, p.category);
      if (p.player_name && p.category) map.set(p.player_name.trim().toLowerCase(), p.category);
    });
  } catch (err) {
    console.error('Error fetching player categories from player_seasons:', err);
  }

  try {
    const rps = await sql`
      SELECT player_id, player_name, category
      FROM realplayerstats
      WHERE season_id = ${seasonId}
    `;
    rps.forEach((p: any) => {
      if (p.player_id && p.category && !map.has(p.player_id)) {
        map.set(p.player_id, p.category);
      }
      if (p.player_name && p.category && !map.has(p.player_name.trim().toLowerCase())) {
        map.set(p.player_name.trim().toLowerCase(), p.category);
      }
    });
  } catch (err) {
    console.error('Error fetching player categories from realplayerstats:', err);
  }

  return map;
}

/**
 * GET /api/awards/eligible
 * Get eligible candidates for awards
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournament_id');
    const seasonId = searchParams.get('season_id');
    const awardType = searchParams.get('award_type');
    const roundNumber = searchParams.get('round_number');
    const weekNumber = searchParams.get('week_number');
    const skipAwardCheck = searchParams.get('skip_award_check') === 'true'; // For fan polls and awards page candidate viewing

    if (!tournamentId || !seasonId || !awardType) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();

    let candidates: any[] = [];

    switch (awardType) {
      case 'POTD': {
        // Get MOTM winners from fixtures in this round
        if (!roundNumber) {
          return NextResponse.json(
            { success: false, error: 'round_number required for POTD' },
            { status: 400 }
          );
        }

        console.log(`🔍 Searching for POTD candidates: tournament=${tournamentId}, round=${roundNumber}`);

        // Check if an award has already been given for this round (skip if skipAwardCheck is true)
        if (!skipAwardCheck) {
          const existingAward = await sql`
            SELECT player_id, player_name
            FROM awards
            WHERE tournament_id = ${tournamentId}
              AND award_type = 'POTD'
              AND round_number = ${parseInt(roundNumber)}
          `;

          if (existingAward.length > 0) {
            console.log(`⚠️ POTD award already given for round ${roundNumber} to ${existingAward[0].player_name}`);
            // Return empty candidates list since award is already given
            return NextResponse.json({
              success: true,
              data: [],
              message: 'Award already given for this round'
            });
          }
        }

        const fixtures = await sql`
          SELECT 
            f.id as fixture_id,
            f.motm_player_id,
            f.motm_player_name,
            f.home_team_id,
            f.home_team_name,
            f.away_team_id,
            f.away_team_name,
            f.home_score,
            f.away_score,
            f.status,
            f.round_number
          FROM fixtures f
          WHERE f.tournament_id = ${tournamentId}
            AND f.round_number = ${parseInt(roundNumber)}
            AND f.status = 'completed'
        `;

        console.log(`📊 Found ${fixtures.length} completed fixtures in round ${roundNumber}`);
        console.log(`🏆 Fixtures with MOTM: ${fixtures.filter((f: any) => f.motm_player_id).length}`);

        const categoryMap = await getPlayerCategoriesMap(sql, seasonId);

        // Create candidates from MOTM winners with their match stats
        for (const fixture of fixtures) {
          if (fixture.motm_player_id && fixture.motm_player_name) {
            // Get all matchups for this fixture
            const matchups = await sql`
              SELECT 
                home_player_id,
                away_player_id,
                home_goals,
                away_goals,
                home_player_name,
                away_player_name,
                position
              FROM matchups
              WHERE fixture_id = ${fixture.fixture_id}
            `;

            let nomineePlayerId = fixture.motm_player_id;
            let nomineePlayerName = fixture.motm_player_name;
            let nomineeTeamId = fixture.home_team_id;
            let nomineeTeamName = fixture.home_team_name;
            let nomineeGoals = 0;

            let opponentPlayerId = '';
            let opponentPlayerName = '';
            let opponentTeamId = fixture.away_team_id;
            let opponentTeamName = fixture.away_team_name;
            let opponentGoals = 0;
            let matchupDetails = '';

            const motmLower = fixture.motm_player_name ? fixture.motm_player_name.trim().toLowerCase() : '';

            const homeMatch = matchups.find((m: any) =>
              (m.home_player_id && m.home_player_id === fixture.motm_player_id) ||
              (m.home_player_name && motmLower && m.home_player_name.trim().toLowerCase() === motmLower)
            );

            const awayMatch = matchups.find((m: any) =>
              (m.away_player_id && m.away_player_id === fixture.motm_player_id) ||
              (m.away_player_name && motmLower && m.away_player_name.trim().toLowerCase() === motmLower)
            );

            if (homeMatch) {
              nomineePlayerId = homeMatch.home_player_id || fixture.motm_player_id;
              nomineePlayerName = fixture.motm_player_name || homeMatch.home_player_name;
              nomineeTeamId = fixture.home_team_id;
              nomineeTeamName = fixture.home_team_name;
              nomineeGoals = homeMatch.home_goals || 0;

              opponentPlayerId = homeMatch.away_player_id || '';
              opponentPlayerName = homeMatch.away_player_name || '';
              opponentTeamId = fixture.away_team_id;
              opponentTeamName = fixture.away_team_name;
              opponentGoals = homeMatch.away_goals || 0;

              matchupDetails = `${nomineePlayerName} ${nomineeGoals}-${opponentGoals} ${opponentPlayerName || opponentTeamName}`;
            } else if (awayMatch) {
              nomineePlayerId = awayMatch.away_player_id || fixture.motm_player_id;
              nomineePlayerName = fixture.motm_player_name || awayMatch.away_player_name;
              nomineeTeamId = fixture.away_team_id;
              nomineeTeamName = fixture.away_team_name;
              nomineeGoals = awayMatch.away_goals || 0;

              opponentPlayerId = awayMatch.home_player_id || '';
              opponentPlayerName = awayMatch.home_player_name || '';
              opponentTeamId = fixture.home_team_id;
              opponentTeamName = fixture.home_team_name;
              opponentGoals = awayMatch.home_goals || 0;

              matchupDetails = `${nomineePlayerName} ${nomineeGoals}-${opponentGoals} ${opponentPlayerName || opponentTeamName}`;
            }

            const nomineeCat = (nomineePlayerId ? categoryMap.get(nomineePlayerId) : null) || (nomineePlayerName ? categoryMap.get(nomineePlayerName.trim().toLowerCase()) : null) || null;
            const opponentCat = (opponentPlayerId ? categoryMap.get(opponentPlayerId) : null) || (opponentPlayerName ? categoryMap.get(opponentPlayerName.trim().toLowerCase()) : null) || null;

            candidates.push({
              player_id: nomineePlayerId,
              player_name: nomineePlayerName,
              category: nomineeCat,
              team_id: nomineeTeamId,
              team_name: nomineeTeamName,
              opponent_player_id: opponentPlayerId || null,
              opponent_player_name: opponentPlayerName || null,
              opponent_category: opponentCat,
              opponent_team_id: opponentTeamId || null,
              opponent_team_name: opponentTeamName || null,
              fixture_id: fixture.fixture_id,
              result: `${fixture.home_team_name} ${fixture.home_score}-${fixture.away_score} ${fixture.away_team_name}`,
              matchup_result: matchupDetails,
              round_number: fixture.round_number || parseInt(roundNumber),
              performance_stats: {
                goals: nomineeGoals,
                opponent_goals: opponentGoals,
                motm: true,
                match_score: `${fixture.home_score}-${fixture.away_score}`,
                matchup: matchupDetails,
                opponent_name: opponentPlayerName || null,
                opponent_category: opponentCat,
                opponent_team: opponentTeamName || null,
              },
            });
          }
        }

        console.log(`✅ Found ${candidates.length} POTD candidates`);
        break;
      }

      case 'POTW': {
        // Get all players who played in this week with their cumulative stats
        if (!weekNumber) {
          return NextResponse.json(
            { success: false, error: 'week_number required for POTW' },
            { status: 400 }
          );
        }

        // Custom week ranges
        const weekRanges: Record<number, { start: number; end: number }> = {
          1: { start: 1, end: 7 },
          2: { start: 8, end: 13 },
          3: { start: 14, end: 20 },
          4: { start: 21, end: 26 },
        };

        const week = parseInt(weekNumber);
        const weekRange = weekRanges[week];

        if (!weekRange) {
          return NextResponse.json(
            { success: false, error: `Invalid week number: ${week}. Valid weeks are 1-4.` },
            { status: 400 }
          );
        }

        const startRound = weekRange.start;
        const endRound = weekRange.end;

        console.log(`🔍 Searching for POTW candidates: week=${weekNumber}, rounds ${startRound}-${endRound}`);

        // Check if an award has already been given for this week (skip for fan polls)
        if (!skipAwardCheck) {
          const existingAward = await sql`
            SELECT player_id, player_name
            FROM awards
            WHERE tournament_id = ${tournamentId}
              AND award_type = 'POTW'
              AND week_number = ${parseInt(weekNumber)}
          `;

          if (existingAward.length > 0) {
            console.log(`⚠️ POTW award already given for week ${weekNumber} to ${existingAward[0].player_name}`);
            return NextResponse.json({
              success: true,
              data: [],
              message: 'Award already given for this week'
            });
          }
        }

        // Get all matchups from this week
        const matchups = await sql`
          SELECT 
            m.home_player_id,
            m.home_player_name,
            m.away_player_id,
            m.away_player_name,
            m.home_goals,
            m.away_goals,
            f.round_number,
            f.home_team_name,
            f.away_team_name
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE f.tournament_id = ${tournamentId}
            AND f.round_number >= ${startRound}
            AND f.round_number <= ${endRound}
            AND f.status = 'completed'
        `;

        // Aggregate stats for each player
        const playerMap = new Map();

        matchups.forEach((matchup: any) => {
          const homeGoals = Number(matchup.home_goals || 0);
          const awayGoals = Number(matchup.away_goals || 0);

          // Process home player
          if (matchup.home_player_id) {
            if (!playerMap.has(matchup.home_player_id)) {
              playerMap.set(matchup.home_player_id, {
                player_id: matchup.home_player_id,
                player_name: matchup.home_player_name,
                team_name: matchup.home_team_name,
                matches_played: 0,
                total_goals: 0,
                goals_conceded: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                clean_sheets: 0,
                rounds_played: new Set(),
              });
            }
            const player = playerMap.get(matchup.home_player_id);
            player.matches_played++;
            player.total_goals += homeGoals;
            player.goals_conceded += awayGoals;
            player.rounds_played.add(matchup.round_number);
            if (homeGoals > awayGoals) player.wins++;
            else if (homeGoals === awayGoals) player.draws++;
            else player.losses++;
            if (awayGoals === 0) player.clean_sheets++;
          }

          // Process away player
          if (matchup.away_player_id) {
            if (!playerMap.has(matchup.away_player_id)) {
              playerMap.set(matchup.away_player_id, {
                player_id: matchup.away_player_id,
                player_name: matchup.away_player_name,
                team_name: matchup.away_team_name,
                matches_played: 0,
                total_goals: 0,
                goals_conceded: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                clean_sheets: 0,
                rounds_played: new Set(),
              });
            }
            const player = playerMap.get(matchup.away_player_id);
            player.matches_played++;
            player.total_goals += awayGoals;
            player.goals_conceded += homeGoals;
            player.rounds_played.add(matchup.round_number);
            if (awayGoals > homeGoals) player.wins++;
            else if (awayGoals === homeGoals) player.draws++;
            else player.losses++;
            if (homeGoals === 0) player.clean_sheets++;
          }
        });

        const potwCategoryMap = await getPlayerCategoriesMap(sql, seasonId);

        // Convert to candidates array and sort by points, goal difference, total goals
        candidates = Array.from(playerMap.values())
          .map((player: any) => {
            const points = (player.wins * 3) + player.draws;
            const goalDiff = player.total_goals - player.goals_conceded;
            return {
              player_id: player.player_id,
              player_name: player.player_name,
              team_name: player.team_name,
              category: potwCategoryMap.get(player.player_id) || null,
              performance_stats: {
                matches_played: player.matches_played,
                goals: player.total_goals,
                goals_for: player.total_goals,
                total_goals: player.total_goals,
                goals_conceded: player.goals_conceded,
                opponent_goals: player.goals_conceded,
                clean_sheets: player.clean_sheets,
                wins: player.wins,
                draws: player.draws,
                losses: player.losses,
                points: points,
                goal_difference: goalDiff,
                rounds_played: Array.from(player.rounds_played).sort(),
                avg_goals: (player.total_goals / player.matches_played).toFixed(2),
              },
            };
          })
          .sort((a: any, b: any) => {
            if (b.performance_stats.points !== a.performance_stats.points) {
              return b.performance_stats.points - a.performance_stats.points;
            }
            if (b.performance_stats.goal_difference !== a.performance_stats.goal_difference) {
              return b.performance_stats.goal_difference - a.performance_stats.goal_difference;
            }
            return b.performance_stats.total_goals - a.performance_stats.total_goals;
          })
          .slice(0, 20); // Top 20 performers

        console.log(`✅ Found ${candidates.length} POTW candidates`);
        break;
      }

      case 'TOD': {
        // Get teams from fixtures in this round, sorted by performance
        if (!roundNumber) {
          return NextResponse.json(
            { success: false, error: 'round_number required for TOD' },
            { status: 400 }
          );
        }

        // Check if an award has already been given for this round (skip if skipAwardCheck is true)
        if (!skipAwardCheck) {
          const existingAward = await sql`
            SELECT team_id, team_name
            FROM awards
            WHERE tournament_id = ${tournamentId}
              AND award_type = 'TOD'
              AND round_number = ${parseInt(roundNumber)}
          `;

          if (existingAward.length > 0) {
            console.log(`⚠️ TOD award already given for round ${roundNumber} to ${existingAward[0].team_name}`);
            return NextResponse.json({
              success: true,
              data: [],
              message: 'Award already given for this round'
            });
          }
        }

        const fixtures = await sql`
          SELECT 
            f.id as fixture_id,
            f.home_team_id,
            f.home_team_name,
            f.home_score,
            f.away_team_id,
            f.away_team_name,
            f.away_score,
            f.round_number
          FROM fixtures f
          WHERE f.tournament_id = ${tournamentId}
            AND f.round_number = ${parseInt(roundNumber)}
            AND f.status = 'completed'
        `;

        fixtures.forEach((fixture: any) => {
          const homeScore = fixture.home_score ?? 0;
          const awayScore = fixture.away_score ?? 0;

          // Home team candidate
          candidates.push({
            team_id: fixture.home_team_id,
            team_name: fixture.home_team_name,
            opponent_team_id: fixture.away_team_id,
            opponent_team_name: fixture.away_team_name,
            fixture_id: fixture.fixture_id,
            round_number: fixture.round_number || parseInt(roundNumber),
            result: `${fixture.home_team_name} ${homeScore}-${awayScore} ${fixture.away_team_name}`,
            performance_stats: {
              goals_for: homeScore,
              goals_against: awayScore,
              goal_difference: homeScore - awayScore,
              wins: homeScore > awayScore ? 1 : 0,
              draws: homeScore === awayScore ? 1 : 0,
              losses: homeScore < awayScore ? 1 : 0,
              clean_sheet: awayScore === 0,
              opponent_team: fixture.away_team_name,
              match_score: `${homeScore}-${awayScore}`,
            },
          });

          // Away team candidate
          candidates.push({
            team_id: fixture.away_team_id,
            team_name: fixture.away_team_name,
            opponent_team_id: fixture.home_team_id,
            opponent_team_name: fixture.home_team_name,
            fixture_id: fixture.fixture_id,
            round_number: fixture.round_number || parseInt(roundNumber),
            result: `${fixture.away_team_name} ${awayScore}-${homeScore} ${fixture.home_team_name}`,
            performance_stats: {
              goals_for: awayScore,
              goals_against: homeScore,
              goal_difference: awayScore - homeScore,
              wins: awayScore > homeScore ? 1 : 0,
              draws: awayScore === homeScore ? 1 : 0,
              losses: awayScore < homeScore ? 1 : 0,
              clean_sheet: homeScore === 0,
              opponent_team: fixture.home_team_name,
              match_score: `${awayScore}-${homeScore}`,
            },
          });
        });

        // Sort by points (win=3, draw=1, loss=0), then goal difference, then goals scored
        candidates.sort((a: any, b: any) => {
          const pointsA = (a.performance_stats.wins * 3) + a.performance_stats.draws;
          const pointsB = (b.performance_stats.wins * 3) + b.performance_stats.draws;
          if (pointsB !== pointsA) return pointsB - pointsA;
          const diffA = a.performance_stats.goal_difference;
          const diffB = b.performance_stats.goal_difference;
          if (diffB !== diffA) return diffB - diffA;
          return b.performance_stats.goals_for - a.performance_stats.goals_for;
        });

        console.log(`✅ Found ${candidates.length} TOD candidates`);
        break;
      }

      case 'TOW': {
        // Get teams from fixtures in this week, sorted by cumulative performance
        if (!weekNumber) {
          return NextResponse.json(
            { success: false, error: 'week_number required for TOW' },
            { status: 400 }
          );
        }

        // Custom week ranges
        const weekRanges: Record<number, { start: number; end: number }> = {
          1: { start: 1, end: 7 },
          2: { start: 8, end: 13 },
          3: { start: 14, end: 20 },
          4: { start: 21, end: 26 },
        };

        const week = parseInt(weekNumber);
        const weekRange = weekRanges[week];

        if (!weekRange) {
          return NextResponse.json(
            { success: false, error: `Invalid week number: ${week}. Valid weeks are 1-4.` },
            { status: 400 }
          );
        }

        const startRound = weekRange.start;
        const endRound = weekRange.end;

        console.log(`🔍 Searching for TOW candidates: week=${weekNumber}, rounds ${startRound}-${endRound}`);

        // Check if an award has already been given for this week (skip for fan polls)
        if (!skipAwardCheck) {
          const existingAward = await sql`
            SELECT team_id, team_name
            FROM awards
            WHERE tournament_id = ${tournamentId}
              AND award_type = 'TOW'
              AND week_number = ${parseInt(weekNumber)}
          `;

          if (existingAward.length > 0) {
            console.log(`⚠️ TOW award already given for week ${weekNumber} to ${existingAward[0].team_name}`);
            return NextResponse.json({
              success: true,
              data: [],
              message: 'Award already given for this week'
            });
          }
        }

        const fixtures = await sql`
          SELECT 
            f.home_team_id,
            f.home_team_name,
            f.home_score,
            f.away_team_id,
            f.away_team_name,
            f.away_score,
            f.round_number
          FROM fixtures f
          WHERE f.tournament_id = ${tournamentId}
            AND f.round_number >= ${startRound}
            AND f.round_number <= ${endRound}
            AND f.status = 'completed'
        `;

        console.log(`📊 Found ${fixtures.length} completed fixtures in week ${weekNumber}`);

        const teamPerformance = new Map();

        fixtures.forEach((fixture: any) => {
          // Home team
          if (!teamPerformance.has(fixture.home_team_id)) {
            teamPerformance.set(fixture.home_team_id, {
              team_id: fixture.home_team_id,
              team_name: fixture.home_team_name,
              goals_for: 0,
              goals_against: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              matches_played: 0,
              rounds_played: new Set(),
            });
          }
          const homeTeam = teamPerformance.get(fixture.home_team_id);
          homeTeam.goals_for += fixture.home_score;
          homeTeam.goals_against += fixture.away_score;
          homeTeam.matches_played++;
          homeTeam.rounds_played.add(fixture.round_number);
          if (fixture.home_score > fixture.away_score) homeTeam.wins++;
          else if (fixture.home_score === fixture.away_score) homeTeam.draws++;
          else homeTeam.losses++;

          // Away team
          if (!teamPerformance.has(fixture.away_team_id)) {
            teamPerformance.set(fixture.away_team_id, {
              team_id: fixture.away_team_id,
              team_name: fixture.away_team_name,
              goals_for: 0,
              goals_against: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              matches_played: 0,
              rounds_played: new Set(),
            });
          }
          const awayTeam = teamPerformance.get(fixture.away_team_id);
          awayTeam.goals_for += fixture.away_score;
          awayTeam.goals_against += fixture.home_score;
          awayTeam.matches_played++;
          awayTeam.rounds_played.add(fixture.round_number);
          if (fixture.away_score > fixture.home_score) awayTeam.wins++;
          else if (fixture.away_score === fixture.home_score) awayTeam.draws++;
          else awayTeam.losses++;
        });

        candidates = Array.from(teamPerformance.values()).map((team: any) => ({
          team_id: team.team_id,
          team_name: team.team_name,
          performance_stats: {
            matches_played: team.matches_played,
            goals_for: team.goals_for,
            goals_against: team.goals_against,
            goal_difference: team.goals_for - team.goals_against,
            wins: team.wins,
            draws: team.draws,
            losses: team.losses,
            rounds_played: Array.from(team.rounds_played).sort(),
            points: (team.wins * 3) + team.draws,
            clean_sheets: team.goals_against === 0 ? 1 : 0,
          },
        }));

        // Sort by points, then goal difference, then goals scored
        candidates.sort((a: any, b: any) => {
          if (b.performance_stats.points !== a.performance_stats.points) {
            return b.performance_stats.points - a.performance_stats.points;
          }
          if (b.performance_stats.goal_difference !== a.performance_stats.goal_difference) {
            return b.performance_stats.goal_difference - a.performance_stats.goal_difference;
          }
          return b.performance_stats.goals_for - a.performance_stats.goals_for;
        });

        console.log(`✅ Found ${candidates.length} TOW candidates`);
        break;
      }

      case 'POTS':
      case 'TOTS': {
        // For season awards, return all players/teams with season stats
        if (awardType === 'POTS') {
          const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
          const isModern = seasonNum === 16 || seasonNum === 17;

          let players;
          if (isModern) {
            players = await sql`
              SELECT 
                ps.player_id,
                ps.player_name,
                ps.category,
                ps.team_id,
                ps.points,
                ps.goals_scored,
                ps.goals_conceded,
                ps.clean_sheets,
                ps.assists,
                ps.matches_played,
                ps.motm_awards,
                ps.wins,
                ps.draws,
                ps.losses
              FROM player_seasons ps
              WHERE ps.season_id = ${seasonId}
              ORDER BY 
                ps.points DESC,
                (ps.goals_scored - ps.goals_conceded) DESC,
                ps.goals_scored DESC
              LIMIT 50
            `;
          } else {
            players = await sql`
              SELECT 
                ps.player_id,
                ps.player_name,
                ps.category,
                ps.team_id,
                ps.points,
                ps.goals_scored,
                ps.goals_conceded,
                ps.clean_sheets,
                ps.assists,
                ps.matches_played,
                ps.motm_awards,
                ps.wins,
                ps.draws,
                ps.losses
              FROM realplayerstats ps
              WHERE ps.season_id = ${seasonId}
              ORDER BY 
                ps.points DESC,
                (ps.goals_scored - ps.goals_conceded) DESC,
                ps.goals_scored DESC
              LIMIT 50
            `;
          }

          candidates = players.map((p: any) => ({
            player_id: p.player_id,
            player_name: p.player_name,
            category: p.category || null,
            team_id: p.team_id,
            performance_stats: {
              points: p.points || 0,
              goals: p.goals_scored,
              goals_conceded: p.goals_conceded,
              clean_sheets: p.clean_sheets,
              goal_difference: (p.goals_scored || 0) - (p.goals_conceded || 0),
              assists: p.assists,
              matches_played: p.matches_played,
              motm_count: p.motm_awards,
              wins: p.wins,
              draws: p.draws,
              losses: p.losses,
            },
          }));
        } else {
          const teams = await sql`
            SELECT 
              ts.team_id,
              ts.team_name,
              ts.wins,
              ts.draws,
              ts.losses,
              ts.goals_for,
              ts.goals_against
            FROM teamstats ts
            WHERE ts.season_id = ${seasonId}
            ORDER BY 
              ts.wins DESC,
              (ts.goals_for - ts.goals_against) DESC
            LIMIT 20
          `;

          candidates = teams.map((t: any) => ({
            team_id: t.team_id,
            team_name: t.team_name,
            performance_stats: {
              wins: t.wins,
              draws: t.draws,
              losses: t.losses,
              goals_for: t.goals_for,
              goals_against: t.goals_against,
              goal_difference: t.goals_for - t.goals_against,
            },
          }));
        }
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid award type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: candidates,
    });
  } catch (error: any) {
    console.error('Error fetching eligible candidates:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
