import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/revert-fixture-points
 * Delete fantasy points for a specific fixture
 * Used when results are being edited/reverted
 * 
 * Request body:
 * {
 *   fixture_id: string;
 *   season_id: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fixture_id, season_id } = body;

    if (!fixture_id || !season_id) {
      return NextResponse.json(
        { error: 'Missing required fields: fixture_id, season_id' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Get fantasy league for this season
    const leagues = await sql`
      SELECT id, league_id
      FROM fantasy_leagues
      WHERE season_id = ${season_id}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      console.log('No fantasy league found for season:', season_id);
      return NextResponse.json({
        success: true,
        message: 'No fantasy league exists for this season',
        reverted: 0,
      });
    }

    const fantasyLeague = leagues[0];
    const fantasy_league_id = fantasyLeague.league_id;

    // Get all player points for this fixture before deleting
    const existingPoints = await sql`
      SELECT team_id, total_points
      FROM fantasy_player_points
      WHERE league_id = ${fantasy_league_id}
        AND fixture_id = ${fixture_id}
    `;

    if (existingPoints.length === 0) {
      console.log('No fantasy points found for fixture:', fixture_id);
      return NextResponse.json({
        success: true,
        message: 'No fantasy points to revert',
        reverted: 0,
      });
    }

    // Group points by team_id to subtract from team totals
    const teamPointsMap = new Map<string, number>();
    for (const record of existingPoints) {
      const currentTotal = teamPointsMap.get(record.team_id) || 0;
      teamPointsMap.set(record.team_id, currentTotal + record.total_points);
    }

    // Delete fantasy_player_points records for this fixture
    const deleted = await sql`
      DELETE FROM fantasy_player_points
      WHERE league_id = ${fantasy_league_id}
        AND fixture_id = ${fixture_id}
    `;

    console.log(`✓ Deleted ${deleted.length} fantasy point records for fixture ${fixture_id}`);

    // Re-sync fantasy_squad.total_points for all squad players in this league
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

    // Re-sync fantasy_teams player_points and total_points
    await sql`
      UPDATE fantasy_teams ft
      SET 
        player_points = COALESCE((
          SELECT SUM(fs.total_points)
          FROM fantasy_squad fs
          WHERE fs.team_id = ft.team_id AND fs.league_id = ft.league_id
        ), 0),
        total_points = COALESCE((
          SELECT SUM(fs.total_points)
          FROM fantasy_squad fs
          WHERE fs.team_id = ft.team_id AND fs.league_id = ft.league_id
        ), 0) + COALESCE(ft.passive_points, 0),
        updated_at = NOW()
      WHERE ft.league_id = ${fantasy_league_id}
    `;

    // Re-sync fantasy_players.total_points for all players in this league
    await sql`
      UPDATE fantasy_players fp
      SET total_points = COALESCE((
        SELECT SUM(base_points)
        FROM fantasy_player_points fpp
        WHERE fpp.real_player_id = fp.real_player_id
          AND fpp.league_id = fp.league_id
      ), 0),
      updated_at = NOW()
      WHERE fp.league_id = ${fantasy_league_id}
    `;

    // Recalculate leaderboard ranks
    await recalculateLeaderboard(fantasy_league_id);

    return NextResponse.json({
      success: true,
      message: `Reverted fantasy points for ${existingPoints.length} player records`,
      reverted: existingPoints.length,
      teams_affected: teamPointsMap.size,
    });
  } catch (error: any) {
    console.error('Error reverting fantasy points:', error);
    return NextResponse.json(
      { 
        error: 'Failed to revert fantasy points',
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
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
