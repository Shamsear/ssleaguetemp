import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * POST /api/fantasy/calculate-points
 * Calculate fantasy points for all drafted players in a fixture
 * Triggered automatically after fixture results are entered
 * 
 * Request body:
 * {
 *   fixture_id: string;
 *   season_id: string;
 *   round_number: number;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fixture_id, season_id, round_number } = body;

    if (!fixture_id || !season_id || round_number === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: fixture_id, season_id, round_number' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Get fantasy league for this season
    const leagues = await sql`
      SELECT id, league_id, is_active
      FROM fantasy_leagues
      WHERE season_id = ${season_id}
        AND is_active = true
      LIMIT 1
    `;

    if (leagues.length === 0) {
      console.log('No active fantasy league found for season:', season_id);
      return NextResponse.json({
        success: true,
        message: 'No fantasy league exists for this season',
        points_calculated: 0,
      });
    }

    const fantasyLeague = leagues[0];
    const fantasy_league_id = fantasyLeague.league_id; // Use league_id, not id

    // Get scoring rules for this league
    let rules = [];
    try {
      rules = await sql`
        SELECT rule_type, points_value
        FROM fantasy_scoring_rules
        WHERE league_id = ${fantasy_league_id}
          AND is_active = true
      `;
    } catch (error: any) {
      console.warn('Could not fetch scoring rules, using defaults');
    }

    // Use default rules if none found
    const scoringRules = new Map();
    if (rules.length > 0) {
      rules.forEach((rule: any) => {
        scoringRules.set(rule.rule_type, rule.points_value);
      });
    } else {
      // Default scoring rules (aligned with S16 point system)
      scoringRules.set('match_played', 1);
      scoringRules.set('goals_scored', 2);
      scoringRules.set('hat_trick', 5);
      scoringRules.set('clean_sheet', 6);
      scoringRules.set('substitution_penalty', -2);
      scoringRules.set('yellow_card', -3);
      scoringRules.set('red_card', -5);
      scoringRules.set('concedes_4_plus_goals', -3);
      scoringRules.set('motm', 5);
      scoringRules.set('player_of_the_week', 10);
      scoringRules.set('fine_goals', -2);
      scoringRules.set('win', 3);
      scoringRules.set('draw', 1);
      scoringRules.set('loss', 0);
    }

    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${protocol}://${host}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'));

    // Fetch fixture data from Neon (includes MOTM)
    const fixtureResponse = await fetch(`${baseUrl}/api/fixtures/${fixture_id}`);
    if (!fixtureResponse.ok) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const { fixture: fixtureData } = await fixtureResponse.json();
    
    // Check if this tournament should be included in fantasy
    if (fixtureData.tournament_id) {
      try {
        const sql = getTournamentDb();
        const tournaments = await sql`
          SELECT include_in_fantasy 
          FROM tournaments 
          WHERE id = ${fixtureData.tournament_id}
        `;
        
        if (tournaments.length > 0 && tournaments[0].include_in_fantasy === false) {
          console.log(`Tournament ${fixtureData.tournament_id} is excluded from fantasy league`);
          return NextResponse.json({
            success: true,
            message: 'Tournament excluded from fantasy league',
            points_calculated: 0,
          });
        }
      } catch (error: any) {
        console.warn('Could not check tournament fantasy setting:', error);
        // Continue anyway if tournament check fails (backward compatibility)
      }
    }

    // Fetch matchup results from Neon
    const matchupsResponse = await fetch(`${baseUrl}/api/fixtures/${fixture_id}/matchups`);
    if (!matchupsResponse.ok) {
      return NextResponse.json(
        { error: 'Matchups not found' },
        { status: 404 }
      );
    }

    const { matchups } = await matchupsResponse.json();

    if (!matchups || matchups.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No matchups found for this fixture',
        points_calculated: 0,
      });
    }

    // Load Firestore categories for category-based win/draw/loss points
    // (same system used in main tournament - overrides flat win/draw/loss from scoring rules)
    const categoriesMap = new Map<string, any>();
    const realPlayersMap = new Map<string, any>();
    try {
      const categoriesSnapshot = await adminDb.collection('categories').get();
      categoriesSnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        categoriesMap.set(doc.id.toLowerCase(), data);
        if (data.name) categoriesMap.set(data.name.toLowerCase(), data);
      });

      const realPlayersSnapshot = await adminDb.collection('realplayers').get();
      realPlayersSnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.player_id) realPlayersMap.set(String(data.player_id), data);
      });
    } catch (err: any) {
      console.warn('Could not load category data from Firestore, using flat scoring rules for result points:', err);
    }

    // Fetch player categories from realplayerstats for category-based result points
    const tournamentSqlDb = getTournamentDb();
    const playerIds = matchups.flatMap((m: any) => [m.home_player_id, m.away_player_id]).filter(Boolean);
    let playerCategoryMap = new Map<string, string>();
    if (playerIds.length > 0) {
      try {
        const categoryRows = await tournamentSqlDb`
          SELECT player_id, category FROM realplayerstats
          WHERE season_id = ${season_id}
            AND player_id = ANY(${playerIds})
        `;
        categoryRows.forEach((r: any) => {
          if (r.player_id && r.category) playerCategoryMap.set(r.player_id, r.category);
        });
      } catch (e) {
        console.warn('Could not fetch player categories for result points:', e);
      }
    }

    // Process each player in the matchups
    const pointsCalculated: any[] = [];
    const teamPointsMap = new Map<string, number>();

    for (const matchup of matchups) {
      const homeCat = playerCategoryMap.get(matchup.home_player_id) || 'Red';
      const awayCat = playerCategoryMap.get(matchup.away_player_id) || 'Red';

      // Process home player
      await processPlayer({
        player_id: matchup.home_player_id,
        player_name: matchup.home_player_name,
        opponent_player_id: matchup.away_player_id,
        opponent_category: awayCat,
        goals_scored: matchup.home_goals || 0,
        goals_conceded: matchup.away_goals || 0,
        result: matchup.home_goals > matchup.away_goals ? 'win' : 
                matchup.home_goals === matchup.away_goals ? 'draw' : 'loss',
        is_motm: fixtureData.motm_player_id === matchup.home_player_id,
        fine_goals: fixtureData.home_penalty_goals || 0,
        substitution_penalty: matchup.home_sub_penalty || 0,
        fantasy_league_id,
        fixture_id,
        round_number,
        scoringRules,
        categoriesMap,
        realPlayersMap,
        sql,
        pointsCalculated,
        teamPointsMap,
      });

      // Process away player
      await processPlayer({
        player_id: matchup.away_player_id,
        player_name: matchup.away_player_name,
        opponent_player_id: matchup.home_player_id,
        opponent_category: homeCat,
        goals_scored: matchup.away_goals || 0,
        goals_conceded: matchup.home_goals || 0,
        result: matchup.away_goals > matchup.home_goals ? 'win' : 
                matchup.away_goals === matchup.home_goals ? 'draw' : 'loss',
        is_motm: fixtureData.motm_player_id === matchup.away_player_id,
        fine_goals: fixtureData.away_penalty_goals || 0,
        substitution_penalty: matchup.away_sub_penalty || 0,
        fantasy_league_id,
        fixture_id,
        round_number,
        scoringRules,
        categoriesMap,
        realPlayersMap,
        sql,
        pointsCalculated,
        teamPointsMap,
      });
    }

    // Calculate team affiliation bonuses
    console.log('🎁 Calculating team affiliation bonuses...');
    try {
      const bonusResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/fantasy/calculate-team-bonuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture_id, season_id, round_number }),
      });
      
      if (bonusResponse.ok) {
        const bonusData = await bonusResponse.json();
        console.log(`✅ Team bonuses: ${bonusData.message}`);
      }
    } catch (error: any) {
      console.error('Error calculating team bonuses:', error);
      // Don't fail the whole request if bonus calculation fails
    }

    // Fully synchronize ALL fantasy team totals with itemized breakdown scores & recalculate ranks
    await syncAllFantasyTeamTotals(fantasy_league_id);

    return NextResponse.json({
      success: true,
      message: `Calculated fantasy points for ${pointsCalculated.length} players`,
      points_calculated: pointsCalculated,
    });
  } catch (error: any) {
    console.error('Error calculating fantasy points:', error);
    return NextResponse.json(
      { 
        error: 'Failed to calculate fantasy points',
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Helper function to process a single player
async function processPlayer(params: {
  player_id: string;
  player_name: string;
  opponent_player_id: string;
  opponent_category: string;
  goals_scored: number;
  goals_conceded: number;
  result: 'win' | 'draw' | 'loss';
  is_motm: boolean;
  fine_goals: number;
  substitution_penalty: number;
  fantasy_league_id: string;
  fixture_id: string;
  round_number: number;
  scoringRules: Map<string, number>;
  categoriesMap: Map<string, any>;
  realPlayersMap: Map<string, any>;
  sql: any;
  pointsCalculated: any[];
  teamPointsMap: Map<string, number>;
}) {
  const {
    player_id, player_name, opponent_player_id, opponent_category, goals_scored, goals_conceded, result,
    is_motm, fine_goals, substitution_penalty, fantasy_league_id,
    fixture_id, round_number, scoringRules, categoriesMap, realPlayersMap,
    sql, pointsCalculated, teamPointsMap
  } = params;

  // Determine target teams based on round_number
  let targetSquads: Array<{ team_id: string; is_captain: boolean; is_vice_captain: boolean }> = [];

  if (round_number <= 6) {
    // Rounds 1-6: Find team that drafted this player in slots 1-5
    const draftBids = await sql`
      SELECT team_id
      FROM fantasy_draft_bids
      WHERE league_id = ${fantasy_league_id}
        AND target_id = ${player_id}
        AND slot_index BETWEEN 1 AND 5
        AND status = 'won'
    `;
    if (draftBids.length > 0) {
      targetSquads = draftBids.map((b: any) => ({
        team_id: b.team_id,
        is_captain: false,
        is_vice_captain: false,
      }));
    }
  } else {
    // Rounds 7+: Find team in current fantasy_squad
    const squads = await sql`
      SELECT team_id, is_captain, is_vice_captain
      FROM fantasy_squad
      WHERE league_id = ${fantasy_league_id}
        AND real_player_id = ${player_id}
    `;
    if (squads.length > 0) {
      targetSquads = squads.map((s: any) => ({
        team_id: s.team_id,
        is_captain: s.is_captain || false,
        is_vice_captain: s.is_vice_captain || false,
      }));
    }
  }

  // --- Category-Based Result Points (based on opponent's category, same as main tournament) ---
  const getCategoryResultPts = (oppCat: string, outcome: string): number => {
    const cat = (oppCat || '').toLowerCase();
    if (cat.includes('red') || cat === 'r')   return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3);
    if (cat.includes('black'))                 return outcome === 'win' ? 7 : (outcome === 'draw' ? 3 : -4);
    if (cat.includes('blue') || cat === 'b')  return outcome === 'win' ? 6 : (outcome === 'draw' ? 2 : -5);
    if (cat.includes('white') || cat === 'w') return outcome === 'win' ? 5 : (outcome === 'draw' ? 1 : -6);
    return outcome === 'win' ? 8 : (outcome === 'draw' ? 4 : -3); // default = Red
  };
  const resultPoints: number = getCategoryResultPts(opponent_category, result);
  console.log(`📊 [Fantasy Result] ${player_name} [${result}] vs [${opponent_category}] → ${resultPoints} pts`);

  // Calculate points breakdown (same for all teams)
  const is_clean_sheet = goals_conceded === 0;

  const points_breakdown: any = {
    opponent_player_id: opponent_player_id || '',
    goals: goals_scored * (scoringRules.get('goals_scored') || 0),
    conceded: goals_conceded * (scoringRules.get('goals_conceded') || 0),
    result: resultPoints,
    motm: is_motm ? (scoringRules.get('motm') || 0) : 0,
    fines: fine_goals * (scoringRules.get('fine_goals') || 0),
    clean_sheet: is_clean_sheet ? (scoringRules.get('clean_sheet') || 0) : 0,
    substitution: substitution_penalty > 0 ? (scoringRules.get('substitution_penalty') || 0) : 0,
  };
  
  if (goals_scored === 2) points_breakdown.brace = scoringRules.get('brace') || 0;
  if (goals_scored >= 3) points_breakdown.hat_trick = scoringRules.get('hat_trick') || 0;
  if (goals_scored >= 6) points_breakdown.scored_6_plus = scoringRules.get('scored_6_plus_goals') || 0;
  if (goals_conceded >= 4) points_breakdown.concedes_4_plus = scoringRules.get('concedes_4_plus_goals') || 0;
  if (goals_conceded >= 15) points_breakdown.concedes_15_plus = scoringRules.get('concedes_15_plus_goals') || 0;
  points_breakdown.match_played = scoringRules.get('match_played') || 0;

  const base_points = Object.keys(points_breakdown)
    .filter(k => k !== 'opponent_player_id')
    .reduce((sum: number, key: string) => sum + (Number(points_breakdown[key]) || 0), 0);

  // Award points to EACH team that owns this player in this round
  for (const squad of targetSquads) {
    const fantasy_team_id = squad.team_id;

    // Check if there is a captain window covering this round
    const windows = await sql`
      SELECT window_id FROM fantasy_captain_windows
      WHERE league_id = ${fantasy_league_id}
        AND ${round_number} >= start_round
        AND ${round_number} <= end_round
      LIMIT 1
    `;

    let isCaptain = squad.is_captain;
    let isViceCaptain = squad.is_vice_captain;

    if (windows.length > 0) {
      const windowId = windows[0].window_id;
      const selections = await sql`
        SELECT captain_player_id, vice_captain_player_id
        FROM fantasy_captain_history
        WHERE league_id = ${fantasy_league_id}
          AND team_id = ${fantasy_team_id}
          AND window_id = ${windowId}
        ORDER BY changed_at DESC
        LIMIT 1
      `;
      if (selections.length > 0) {
        isCaptain = selections[0].captain_player_id === player_id;
        isViceCaptain = selections[0].vice_captain_player_id === player_id;
      }
    }

    let multiplier = isCaptain ? 2 : isViceCaptain ? 1.5 : 1;
    let multiplierPercentage = isCaptain ? 200 : isViceCaptain ? 150 : 100;
    const final_points = Math.round(base_points * multiplier);

    await sql`
      DELETE FROM fantasy_player_points
      WHERE league_id = ${fantasy_league_id}
        AND team_id = ${fantasy_team_id}
        AND real_player_id = ${player_id}
        AND fixture_id = ${fixture_id}
    `;

    await sql`
      INSERT INTO fantasy_player_points (
        league_id,
        team_id,
        real_player_id,
        player_name,
        fixture_id,
        round_number,
        goals_scored,
        goals_conceded,
        result,
        is_motm,
        fine_goals,
        substitution_penalty,
        is_clean_sheet,
        is_captain,
        is_vice_captain,
        points_multiplier,
        base_points,
        points_breakdown,
        total_points,
        calculated_at
      ) VALUES (
        ${fantasy_league_id},
        ${fantasy_team_id},
        ${player_id},
        ${player_name},
        ${fixture_id},
        ${round_number},
        ${goals_scored},
        ${goals_conceded},
        ${result},
        ${is_motm},
        ${fine_goals},
        ${substitution_penalty},
        ${is_clean_sheet},
        ${isCaptain},
        ${isViceCaptain},
        ${multiplierPercentage},
        ${base_points},
        ${JSON.stringify(points_breakdown)},
        ${final_points},
        NOW()
      )
    `;

    // Track team points
    const currentTeamPoints = teamPointsMap.get(fantasy_team_id) || 0;
    teamPointsMap.set(fantasy_team_id, currentTeamPoints + final_points);

    // Update fantasy_squad with points for this team
    await sql`
      UPDATE fantasy_squad
      SET 
        total_points = COALESCE((
          SELECT SUM(fpp.total_points)
          FROM fantasy_player_points fpp
          WHERE fpp.real_player_id = ${player_id}
            AND fpp.team_id = ${fantasy_team_id}
            AND fpp.league_id = ${fantasy_league_id}
        ), 0)
      WHERE team_id = ${fantasy_team_id}
        AND real_player_id = ${player_id}
    `;

    pointsCalculated.push({
      player_id,
      player_name,
      fantasy_team_id,
      base_points: base_points,
      multiplier: multiplier,
      final_points: final_points,
      is_captain: isCaptain,
      is_vice_captain: isViceCaptain,
      breakdown: points_breakdown,
    });
  }

  // Update fantasy_players with cumulative total_points across all completed fixtures
  // (Sums base_points from fantasy_player_points if drafted, or computes base_points for free agents)
  await sql`
    UPDATE fantasy_players
    SET 
      total_points = COALESCE((
        SELECT SUM(fpp.base_points)
        FROM fantasy_player_points fpp
        WHERE fpp.real_player_id = ${player_id}
          AND fpp.league_id = ${fantasy_league_id}
      ), ${base_points}),
      updated_at = NOW()
    WHERE league_id = ${fantasy_league_id} 
      AND real_player_id = ${player_id}
  `;
}

/**
 * Synchronize fantasy team total scores with breakdown records.
 * Sums player_points from fantasy_player_points and passive_points from fantasy_team_bonus_points
 * for ALL fantasy teams in the league, then recalculates leaderboard ranks.
 */
export async function syncAllFantasyTeamTotals(fantasy_league_id: string) {
  try {
    const sql = getFantasyDb();
    
    // Determine active completed round threshold dynamically
    const completedRounds = await sql`
      SELECT MAX(slot_index) as max_completed
      FROM fantasy_draft_rounds
      WHERE league_id = ${fantasy_league_id}
        AND status IN ('completed', 'finalized')
    `;
    const maxCompletedRound = Number(completedRounds[0]?.max_completed || 6);

    // Recalculate player_points, passive_points, and total_points for ALL fantasy teams in the league
    await sql`
      WITH player_totals AS (
        SELECT 
          team_id,
          COALESCE(SUM(total_points), 0) as calc_player_points
        FROM fantasy_player_points
        WHERE league_id = ${fantasy_league_id}
          AND round_number <= ${maxCompletedRound}
        GROUP BY team_id
      ),
      passive_totals AS (
        SELECT 
          team_id,
          COALESCE(SUM(total_bonus), 0) as calc_passive_points
        FROM fantasy_team_bonus_points
        WHERE league_id = ${fantasy_league_id}
          AND round_number <= ${maxCompletedRound}
        GROUP BY team_id
      )
      UPDATE fantasy_teams ft
      SET 
        player_points = COALESCE(pt.calc_player_points, 0),
        passive_points = COALESCE(pas.calc_passive_points, 0),
        total_points = COALESCE(pt.calc_player_points, 0) + COALESCE(pas.calc_passive_points, 0),
        updated_at = NOW()
      FROM fantasy_teams ft_inner
      LEFT JOIN player_totals pt ON ft_inner.team_id = pt.team_id
      LEFT JOIN passive_totals pas ON ft_inner.team_id = pas.team_id
      WHERE ft.team_id = ft_inner.team_id
        AND ft.league_id = ${fantasy_league_id};
    `;

    // Sync fantasy_players.total_points = SUM(fpp.base_points) per player
    // Uses base_points (player's own performance), NOT total_points which includes
    // team-specific captain/VC multipliers. The all-players leaderboard shows
    // player performance; team multipliers only affect fantasy_teams.player_points.
    await sql`
      UPDATE fantasy_players fp
      SET total_points = COALESCE((
        SELECT SUM(fpp.base_points)
        FROM fantasy_player_points fpp
        WHERE fpp.real_player_id = fp.real_player_id
          AND fpp.league_id = fp.league_id
      ), 0),
      updated_at = NOW()
      WHERE fp.league_id = ${fantasy_league_id}
    `;

    // Sync fantasy_squad.total_points = SUM(fpp.total_points) per player per team
    // This is the team-specific contribution including captain/VC multiplier
    await sql`
      UPDATE fantasy_squad fs
      SET total_points = COALESCE((
        SELECT SUM(fpp.total_points)
        FROM fantasy_player_points fpp
        WHERE fpp.real_player_id = fs.real_player_id
          AND fpp.team_id = fs.team_id
          AND fpp.league_id = fs.league_id
      ), 0)
      WHERE fs.league_id = ${fantasy_league_id}
    `;

    // Recalculate ranks based on updated total_points
    await sql`
      WITH ranked_teams AS (
        SELECT 
          team_id,
          ROW_NUMBER() OVER (ORDER BY total_points DESC, team_name ASC) as new_rank
        FROM fantasy_teams
        WHERE league_id = ${fantasy_league_id}
      )
      UPDATE fantasy_teams ft
      SET rank = rt.new_rank, updated_at = NOW()
      FROM ranked_teams rt
      WHERE ft.team_id = rt.team_id
        AND ft.league_id = ${fantasy_league_id};
    `;

    console.log(`✅ Fully synchronized fantasy team totals, player totals & ranks for league ${fantasy_league_id}`);
  } catch (error: any) {
    console.error('Error synchronizing fantasy team totals:', error);
  }
}

// Helper function to recalculate leaderboard ranks
async function recalculateLeaderboard(fantasy_league_id: string) {
  try {
    const sql = getFantasyDb();
    
    await sql`
      WITH ranked_teams AS (
        SELECT 
          team_id,
          ROW_NUMBER() OVER (ORDER BY total_points DESC, team_name ASC) as new_rank
        FROM fantasy_teams
        WHERE league_id = ${fantasy_league_id}
      )
      UPDATE fantasy_teams ft
      SET rank = rt.new_rank, updated_at = NOW()
      FROM ranked_teams rt
      WHERE ft.team_id = rt.team_id
    `;

    console.log(`✅ Leaderboard updated for league ${fantasy_league_id}`);
  } catch (error: any) {
    console.error('Error recalculating leaderboard:', error);
  }
}
