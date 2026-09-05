import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/leagues/[leagueId]
 * Get fantasy league details with teams and scoring rules from PostgreSQL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params;

    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID is required' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    console.log('Fetching fantasy league for:', leagueId);

    // Get fantasy league by league_id or season_id (could be passed as season_id)
    // League IDs should be in format SSPSLFLS{number}
    const leagues = await sql`
      SELECT 
        id,
        league_id,
        league_name,
        season_id,
        season_name,
        budget_per_team,
        min_squad_size,
        max_squad_size,
        max_transfers_per_window,
        points_cost_per_transfer,
        is_active,
        created_at,
        updated_at
      FROM fantasy_leagues
      WHERE league_id = ${leagueId}
         OR season_id = ${leagueId}
      LIMIT 1
    `;

    console.log('Found leagues:', leagues.length);

    // If league not found, try to auto-create it from season data
    if (leagues.length === 0) {
      console.log('League not found, attempting auto-creation...');
      
      try {
        const seasonId = leagueId;
        if (!seasonId || !seasonId.startsWith('SSPSLS')) {
          return NextResponse.json(
            { 
              error: 'Season not found',
              message: `Season ID ${seasonId} is invalid. Please ensure the season ID starts with SSPSLS.`,
            },
            { status: 404 }
          );
        }
        const seasonNumber = seasonId.replace('SSPSLS', '');
        const seasonName = `Season ${seasonNumber}`;
        const newLeagueId = `SSPSLFLS${seasonNumber}`;

        console.log('Creating league:', newLeagueId, 'for season:', seasonId);

        // Default star rating prices (3-10 stars)
        const defaultStarPrices = [
          { stars: 3, price: 5 },
          { stars: 4, price: 7 },
          { stars: 5, price: 10 },
          { stars: 6, price: 13 },
          { stars: 7, price: 16 },
          { stars: 8, price: 20 },
          { stars: 9, price: 25 },
          { stars: 10, price: 30 },
        ];

        // Create the league
        const newLeague = await sql`
          INSERT INTO fantasy_leagues (
            league_id,
            season_id,
            season_name,
            league_name,
            budget_per_team,
            max_squad_size,
            max_transfers_per_window,
            points_cost_per_transfer,
            star_rating_prices,
            is_active
          ) VALUES (
            ${newLeagueId},
            ${seasonId},
            ${seasonName},
            ${seasonName + ' Fantasy League'},
            100.00,
            15,
            2,
            4,
            ${JSON.stringify(defaultStarPrices)},
            true
          )
          RETURNING *
        `;

        if (newLeague.length === 0) {
          console.error('Failed to insert league');
          return NextResponse.json(
            { error: 'Failed to auto-create fantasy league' },
            { status: 500 }
          );
        }

        console.log('League created, now creating scoring rules...');

        // Create default scoring rules for the new league (aligned with S16 point system)
        const defaultRules = [
          // Player Rules
          { rule_type: 'match_played', rule_name: 'Match Played', points_value: 1, applies_to: 'player', description: 'Points for playing a match' },
          { rule_type: 'goals_scored', rule_name: 'Goal Scored', points_value: 2, applies_to: 'player', description: 'Points for scoring a goal' },
          { rule_type: 'hat_trick', rule_name: '3 or more goals', points_value: 5, applies_to: 'player', description: 'Bonus for scoring 3 or more goals' },
          { rule_type: 'clean_sheet', rule_name: 'Clean Sheet (CS)', points_value: 6, applies_to: 'player', description: 'Bonus for not conceding any goals' },
          { rule_type: 'substitution_penalty', rule_name: 'Substitution', points_value: -2, applies_to: 'player', description: 'Penalty for substitutions' },
          { rule_type: 'yellow_card', rule_name: 'Yellow Card', points_value: -3, applies_to: 'player', description: 'Penalty for a yellow card' },
          { rule_type: 'red_card', rule_name: 'Red Card', points_value: -5, applies_to: 'player', description: 'Penalty for a red card' },
          { rule_type: 'concedes_4_plus_goals', rule_name: 'Concede 4 or more goals', points_value: -3, applies_to: 'player', description: 'Penalty for conceding 4 or more goals' },
          { rule_type: 'motm', rule_name: 'Player of the Day (PotD)', points_value: 5, applies_to: 'player', description: 'Bonus for Player of the Day' },
          { rule_type: 'player_of_the_week', rule_name: 'Player of the Week (PotW)', points_value: 10, applies_to: 'player', description: 'Bonus for Player of the Week' },
          { rule_type: 'fine_goals', rule_name: 'Fine Goal', points_value: -2, applies_to: 'player', description: 'Penalty for fine goals' },
          // Win, Draw, Loss placeholders for UI, though calculated via categories
          { rule_type: 'win', rule_name: 'Win (Category-based)', points_value: 3, applies_to: 'player', description: 'Match win points (actual values calculated dynamically based on player categories)' },
          { rule_type: 'draw', rule_name: 'Draw (Category-based)', points_value: 1, applies_to: 'player', description: 'Match draw points (actual values calculated dynamically based on player categories)' },
          { rule_type: 'loss', rule_name: 'Loss (Category-based)', points_value: 0, applies_to: 'player', description: 'Match loss points (actual values calculated dynamically based on player categories)' },

          // Team Rules
          { rule_type: 'win', rule_name: 'Match Win', points_value: 5, applies_to: 'team', description: 'Points for team winning a match' },
          { rule_type: 'draw', rule_name: 'Match Draw', points_value: 3, applies_to: 'team', description: 'Points for team drawing a match' },
          { rule_type: 'loss', rule_name: 'Match Loss', points_value: -1, applies_to: 'team', description: 'Penalty for team losing a match' },
          { rule_type: 'scored_6_plus_goals', rule_name: 'More than 6 goals scored', points_value: 8, applies_to: 'team', description: 'Bonus for team scoring more than 6 goals' },
          { rule_type: 'clean_sheet', rule_name: 'Team Clean Sheet (CS)', points_value: 12, applies_to: 'team', description: 'Bonus for team clean sheet' },
          { rule_type: 'concedes_15_plus_goals', rule_name: 'Concede more than 15 goals', points_value: -5, applies_to: 'team', description: 'Penalty for team conceding more than 15 goals' },
          { rule_type: 'team_of_the_week', rule_name: 'Team of the Week (TOW)', points_value: 10, applies_to: 'team', description: 'Bonus for Team of the Week' },
          { rule_type: 'team_of_the_day', rule_name: 'Team of the Day (TOD)', points_value: 5, applies_to: 'team', description: 'Bonus for Team of the Day' }
        ];

        for (const rule of defaultRules) {
          // Generate unique rule ID using applies_to to prevent collision
          const ruleId = `${newLeagueId}-${rule.applies_to}-${rule.rule_type}`;
          try {
            await sql`
              INSERT INTO fantasy_scoring_rules (
                rule_id,
                league_id,
                rule_type,
                rule_name,
                points_value,
                description,
                applies_to,
                is_active
              ) VALUES (
                ${ruleId},
                ${newLeagueId},
                ${rule.rule_type},
                ${rule.rule_name},
                ${rule.points_value},
                ${rule.description},
                ${rule.applies_to},
                true
              )
              ON CONFLICT (rule_id) DO UPDATE SET
                points_value = EXCLUDED.points_value,
                description = EXCLUDED.description,
                rule_name = EXCLUDED.rule_name
            `;
          } catch (ruleError) {
            console.error('Error creating scoring rule:', rule.rule_type, ruleError);
          }
        }

        console.log(`✅ Auto-created fantasy league: ${newLeagueId} with ${defaultRules.length} scoring rules`);

        // Use the newly created league
        leagues.push(newLeague[0]);
      } catch (creationError) {
        console.error('Error during league auto-creation:', creationError);
        return NextResponse.json(
          { 
            error: 'Failed to auto-create fantasy league',
            details: creationError instanceof Error ? creationError.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
    }

    const league = leagues[0];

    // Get fantasy teams with player counts
    const teams = await sql`
      SELECT 
        ft.team_id,
        ft.team_name,
        ft.owner_name,
        ft.total_points,
        ft.rank,
        ft.draft_submitted,
        ft.supported_team_id,
        ft.supported_team_name,
        COALESCE(ft.passive_points, 0) as passive_points,
        COALESCE(ft.budget_remaining, 0) as budget_remaining,
        COUNT(DISTINCT fs.real_player_id) as player_count
      FROM fantasy_teams ft
      LEFT JOIN fantasy_squad fs ON ft.team_id = fs.team_id
      WHERE ft.league_id = ${league.league_id}
      GROUP BY ft.team_id, ft.team_name, ft.owner_name, ft.total_points, ft.rank, ft.draft_submitted, ft.supported_team_id, ft.supported_team_name, ft.passive_points, ft.budget_remaining
      ORDER BY ft.total_points DESC, ft.rank ASC NULLS LAST, ft.team_name ASC
    `;

    // Get scoring rules (if table exists)
    let scoringRules = [];
    try {
      scoringRules = await sql`
        SELECT 
          id,
          rule_type,
          points_value,
          is_active,
          created_at
        FROM fantasy_scoring_rules
        WHERE league_id = ${league.league_id}
          AND is_active = true
        ORDER BY rule_type ASC
      `;
    } catch (error) {
      console.log('Scoring rules table does not exist yet, returning empty array');
    }

    return NextResponse.json({
      success: true,
      league: {
        id: league.id,
        league_id: league.league_id,
        name: league.league_name,
        season_id: league.season_id,
        season_name: league.season_name,
        status: league.is_active ? 'active' : 'inactive',
        budget_per_team: Number(league.budget_per_team) || 0,
        min_squad_size: Number(league.min_squad_size) || 5,
        max_squad_size: Number(league.max_squad_size) || 15,
        max_transfers_per_window: league.max_transfers_per_window,
        points_cost_per_transfer: league.points_cost_per_transfer,
        created_at: league.created_at,
        updated_at: league.updated_at,
      },
      teams: teams.map((team: any) => ({
        id: team.team_id,
        team_name: team.team_name,
        owner_name: team.owner_name,
        total_points: Number(team.total_points) || 0,
        rank: team.rank || null,
        player_count: Number(team.player_count) || 0,
        draft_submitted: team.draft_submitted || false,
        supported_team_id: team.supported_team_id || null,
        supported_team_name: team.supported_team_name || null,
        passive_points: Number(team.passive_points) || 0,
        budget_remaining: Number(team.budget_remaining) || 0,
      })),
      scoring_rules: scoringRules.map((rule: any) => ({
        id: rule.id,
        rule_type: rule.rule_type,
        points_value: Number(rule.points_value) || 0,
        is_active: rule.is_active,
        created_at: rule.created_at,
      })),
      total_teams: teams.length,
    });
  } catch (error) {
    console.error('Error fetching fantasy league:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch fantasy league',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/fantasy/leagues/[leagueId]
 * Update fantasy league settings (e.g., draft_finalization_mode)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params;

    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { draft_finalization_mode } = body;

    // Validate finalization_mode if provided
    if (draft_finalization_mode && !['auto', 'manual'].includes(draft_finalization_mode)) {
      return NextResponse.json(
        { error: 'Invalid draft_finalization_mode. Must be either "auto" or "manual"' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Update the league
    const updated = await sql`
      UPDATE fantasy_leagues
      SET 
        draft_finalization_mode = COALESCE(${draft_finalization_mode}, draft_finalization_mode),
        updated_at = NOW()
      WHERE league_id = ${leagueId}
      RETURNING *
    `;

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy league not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      league: updated[0],
      message: 'Fantasy league updated successfully',
    });
  } catch (error) {
    console.error('Error updating fantasy league:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update fantasy league',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
