import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET /api/fantasy/players/[playerId]/stats?league_id=xxx
 * Get detailed fantasy stats for a specific player
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const league_id = searchParams.get('league_id');

    if (!playerId) {
      return NextResponse.json(
        { error: 'Player ID is required' },
        { status: 400 }
      );
    }

    if (!league_id) {
      return NextResponse.json(
        { error: 'league_id query parameter is required' },
        { status: 400 }
      );
    }

    // Get fantasy league to get season_id
    const leagues = await fantasySql`
      SELECT * FROM fantasy_leagues
      WHERE league_id = ${league_id}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy league not found' },
        { status: 404 }
      );
    }

    const leagueData = leagues[0];
    const tournamentSql = getTournamentDb();

    const seasonNum = parseInt(leagueData.season_id.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    // Get player info from correct table
    let players;
    if (isModern) {
      players = await tournamentSql`
        SELECT * FROM player_seasons
        WHERE player_id = ${playerId}
          AND season_id = ${leagueData.season_id}
        LIMIT 1
      `;
    } else {
      players = await tournamentSql`
        SELECT * FROM realplayerstats
        WHERE player_id = ${playerId}
          AND season_id = ${leagueData.season_id}
        LIMIT 1
      `;
    }

    if (players.length === 0) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const playerData = players[0];

    // Check if player is drafted
    const drafts = await fantasySql`
      SELECT * FROM fantasy_drafts
      WHERE league_id = ${league_id}
        AND real_player_id = ${playerId}
      LIMIT 1
    `;

    let draftInfo = null;
    let fantasyTeamName = null;

    if (drafts.length > 0) {
      const draft = drafts[0];
      draftInfo = {
        fantasy_team_id: draft.team_id,
        draft_order: draft.draft_order,
        draft_price: draft.draft_price,
      };

      // Get fantasy team name
      const teams = await fantasySql`
        SELECT team_name FROM fantasy_teams
        WHERE team_id = ${draft.team_id}
        LIMIT 1
      `;
      
      if (teams.length > 0) {
        fantasyTeamName = teams[0].team_name;
      }
    }

    // Get all fantasy points for this player (deduplicated by fixture)
    // Since a player can be owned by multiple teams, group by fixture to avoid duplicates
    const playerPoints = await fantasySql`
      SELECT 
        fixture_id,
        round_number,
        goals_scored,
        goals_conceded,
        result,
        is_motm,
        is_clean_sheet,
        base_points as total_points,
        points_breakdown,
        MIN(calculated_at) as calculated_at
      FROM fantasy_player_points
      WHERE league_id = ${league_id}
        AND real_player_id = ${playerId}
      GROUP BY 
        fixture_id, round_number, goals_scored, goals_conceded, 
        result, is_motm, is_clean_sheet, base_points, points_breakdown
      ORDER BY round_number ASC
    `;

    // Get player's team ID to determine opponent
    const playerTeamId = playerData.team_id;

    // Fetch fixture details to get opponent information
    const fixtureIds = playerPoints.map(p => p.fixture_id).filter(Boolean);
    const fixturesMap = new Map();
    
    if (fixtureIds.length > 0) {
      try {
        // Fetch all fixtures in batches (PostgreSQL doesn't have the 10-item IN limit)
        const fixtures = await tournamentSql`
          SELECT * FROM fixtures
          WHERE fixture_id = ANY(${fixtureIds})
        `;
        
        fixtures.forEach(fixture => {
          fixturesMap.set(fixture.fixture_id, fixture);
        });
      } catch (fixtureError) {
        console.error('Error fetching fixtures:', fixtureError);
        // Continue without fixture data
      }
    }

    const matchHistory = playerPoints.map(data => {
      const fixture = fixturesMap.get(data.fixture_id);
      
      let opponent = 'Unknown';
      if (fixture) {
        // Determine if player's team is home or away
        if (fixture.home_team_id === playerTeamId) {
          opponent = fixture.away_team_name || 'Away Team';
        } else if (fixture.away_team_id === playerTeamId) {
          opponent = fixture.home_team_name || 'Home Team';
        }
      }
      
      return {
        round_number: data.round_number,
        fixture_id: data.fixture_id,
        opponent: opponent,
        goals_scored: data.goals_scored || 0,
        goals_conceded: data.goals_conceded || 0,
        result: data.result,
        is_motm: data.is_motm || false,
        is_clean_sheet: data.is_clean_sheet || false,
        points_breakdown: data.points_breakdown,
        total_points: data.total_points || 0,
      };
    });

    // Calculate aggregated stats
    const totalPoints = matchHistory.reduce((sum, m) => sum + m.total_points, 0);
    const matchesPlayed = matchHistory.length;
    const averagePoints = matchesPlayed > 0 ? totalPoints / matchesPlayed : 0;
    const totalGoals = matchHistory.reduce((sum, m) => sum + m.goals_scored, 0);
    const totalConceded = matchHistory.reduce((sum, m) => sum + m.goals_conceded, 0);
    const motmCount = matchHistory.filter(m => m.is_motm).length;
    const cleanSheets = matchHistory.filter(m => m.is_clean_sheet).length;
    const wins = matchHistory.filter(m => m.result === 'win').length;
    const draws = matchHistory.filter(m => m.result === 'draw').length;
    const losses = matchHistory.filter(m => m.result === 'loss').length;

    return NextResponse.json({
      success: true,
      player: {
        real_player_id: playerData.player_id,
        player_name: playerData.player_name,
        star_rating: playerData.star_rating || 5,
        points: playerData.points || 0,
        category: playerData.category || 'Classic',
      },
      draft_info: draftInfo,
      fantasy_team_name: fantasyTeamName,
      is_available: !draftInfo,
      fantasy_stats: {
        total_points: totalPoints,
        matches_played: matchesPlayed,
        average_points: Math.round(averagePoints * 10) / 10,
        total_goals: totalGoals,
        total_conceded: totalConceded,
        motm_count: motmCount,
        clean_sheets: cleanSheets,
        wins: wins,
        draws: draws,
        losses: losses,
      },
      match_history: matchHistory,
    });
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player stats' },
      { status: 500 }
    );
  }
}
