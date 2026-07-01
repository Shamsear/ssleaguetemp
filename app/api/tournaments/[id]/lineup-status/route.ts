import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { id: tournamentId } = await params;

    // Get all fixtures for the tournament with lineup status
    const fixtures = await sql`
      SELECT 
        f.id as fixture_id,
        f.round_number,
        f.match_number,
        f.home_team_id,
        f.home_team_name,
        f.away_team_id,
        f.away_team_name,
        f.status,
        f.leg,
        f.group_name,
        f.knockout_round,
        -- Check if home team has submitted lineup
        EXISTS(
          SELECT 1 FROM lineups 
          WHERE fixture_id = f.id 
            AND team_id = f.home_team_id
            AND submitted_at IS NOT NULL
        ) as home_lineup_submitted,
        -- Check if away team has submitted lineup
        EXISTS(
          SELECT 1 FROM lineups 
          WHERE fixture_id = f.id 
            AND team_id = f.away_team_id
            AND submitted_at IS NOT NULL
        ) as away_lineup_submitted,
        -- Count home team lineup players
        COALESCE((
          SELECT jsonb_array_length(starting_xi) 
          FROM lineups 
          WHERE fixture_id = f.id 
            AND team_id = f.home_team_id
          LIMIT 1
        ), 0) as home_lineup_count,
        -- Count away team lineup players
        COALESCE((
          SELECT jsonb_array_length(starting_xi) 
          FROM lineups 
          WHERE fixture_id = f.id 
            AND team_id = f.away_team_id
          LIMIT 1
        ), 0) as away_lineup_count,
        -- Get home team total squad size
        COALESCE((
          SELECT COUNT(*) 
          FROM (
            SELECT team_id, season_id FROM player_seasons
            UNION ALL
            SELECT team_id, season_id FROM realplayerstats
          ) all_ps
          WHERE all_ps.team_id = f.home_team_id 
            AND all_ps.season_id = f.season_id
        ), 0) as home_total_players,
        -- Get away team total squad size
        COALESCE((
          SELECT COUNT(*) 
          FROM (
            SELECT team_id, season_id FROM player_seasons
            UNION ALL
            SELECT team_id, season_id FROM realplayerstats
          ) all_ps
          WHERE all_ps.team_id = f.away_team_id 
            AND all_ps.season_id = f.season_id
        ), 0) as away_total_players
      FROM fixtures f
      WHERE f.tournament_id = ${tournamentId}
        AND f.status IN ('scheduled', 'in_progress')
      ORDER BY f.round_number ASC, f.match_number ASC
    `;

    return NextResponse.json({
      success: true,
      fixtures: fixtures,
      count: fixtures.length
    });
  } catch (error: any) {
    console.error('Error fetching lineup status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lineup status' },
      { status: 500 }
    );
  }
}
