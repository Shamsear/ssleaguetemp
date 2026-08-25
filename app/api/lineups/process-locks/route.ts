import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * Process lineup locks for fixtures past their deadline
 * Manually triggered by committee from dashboard
 * No cron jobs needed - checks fixture deadlines directly
 */
export async function POST(request: NextRequest) {
  try {
    const now = new Date();
    const body = await request.json();
    const { season_id, round_number } = body;
    const sql = getTournamentDb();

    // Get fixtures with passed deadlines from Neon
    let fixturesQuery = `SELECT * FROM fixtures WHERE lineup_deadline <= $1`;
    const params: any[] = [now.toISOString()];

    if (season_id) {
      params.push(season_id);
      fixturesQuery += ` AND season_id = $${params.length}`;
    }
    if (round_number) {
      params.push(parseInt(round_number));
      fixturesQuery += ` AND round_number = $${params.length}`;
    }

    const fixturesResult: any = await sql.query(fixturesQuery, params);
    const fixturesRows: any[] = Array.isArray(fixturesResult) ? fixturesResult : (fixturesResult?.rows || []);

    if (fixturesRows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No fixtures with passed deadlines',
        processed: 0
      });
    }

    let processedCount = 0;
    const results: any[] = [];

    for (const fixture of fixturesRows) {
      const fixture_id = fixture.id;
      const home_team_id = fixture.home_team_id;
      const away_team_id = fixture.away_team_id;
      const fixtureSeason = fixture.season_id;

      try {
        // Lock home team lineup if exists and not already locked
        const homeLineupRows = await sql`SELECT * FROM lineups WHERE fixture_id = ${fixture_id} AND team_id = ${home_team_id} LIMIT 1`;

        if (homeLineupRows.length > 0) {
          const homeLineup = homeLineupRows[0];
          if (!homeLineup.is_locked) {
            await sql`UPDATE lineups SET is_locked = true, locked_at = ${now.toISOString()}, locked_by = 'system', locked_by_name = 'Auto-lock (Deadline)', updated_at = ${now.toISOString()} WHERE fixture_id = ${fixture_id} AND team_id = ${home_team_id}`;
            results.push({ team_id: home_team_id, status: 'locked' });
            processedCount++;
          }
        } else {
          // Check if team has exactly 5 players - auto-create lineup with all players
          const rosterResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/team/${home_team_id}/roster?season_id=${fixtureSeason}`);
          const rosterData = await rosterResponse.json();
          
          let starters: string[] = [];
          let subs: string[] = [];
          
          if (rosterData.success && rosterData.players) {
            const activePlayers = rosterData.players.filter((p: any) => p.is_active);
            if (activePlayers.length === 5) {
              starters = activePlayers.map((p: any) => p.player_id);
              console.log(`✅ Auto-created lineup for home team ${home_team_id} with 5 players`);
            }
          }
          
          // No lineup submitted - create locked lineup (empty if not 5 players, auto-filled if exactly 5)
          const lineupId = `lineup_${fixture_id}_${home_team_id}`;
          await sql`INSERT INTO lineups (id, fixture_id, team_id, season_id, starters, substitutes, is_locked, locked_at, locked_by, locked_by_name, created_at, updated_at, submitted_by, submitted_by_name)
            VALUES (${lineupId}, ${fixture_id}, ${home_team_id}, ${fixtureSeason || ''}, ${JSON.stringify(starters)}, ${JSON.stringify(subs)}, true, ${now.toISOString()}, 'system', ${starters.length === 5 ? 'Auto-lock (5 Players)' : 'Auto-lock (Deadline - No Submission)'}, ${now.toISOString()}, ${now.toISOString()}, null, null)
            ON CONFLICT (id) DO UPDATE SET
              starters = EXCLUDED.starters, substitutes = EXCLUDED.substitutes,
              is_locked = true, locked_at = EXCLUDED.locked_at, locked_by = 'system',
              locked_by_name = EXCLUDED.locked_by_name, updated_at = EXCLUDED.updated_at`;
          results.push({ team_id: home_team_id, status: starters.length === 5 ? 'locked_auto_5' : 'locked_empty' });
          processedCount++;
        }

        // Lock away team lineup if exists and not already locked
        const awayLineupRows = await sql`SELECT * FROM lineups WHERE fixture_id = ${fixture_id} AND team_id = ${away_team_id} LIMIT 1`;

        if (awayLineupRows.length > 0) {
          const awayLineup = awayLineupRows[0];
          if (!awayLineup.is_locked) {
            await sql`UPDATE lineups SET is_locked = true, locked_at = ${now.toISOString()}, locked_by = 'system', locked_by_name = 'Auto-lock (Deadline)', updated_at = ${now.toISOString()} WHERE fixture_id = ${fixture_id} AND team_id = ${away_team_id}`;
            results.push({ team_id: away_team_id, status: 'locked' });
            processedCount++;
          }
        } else {
          // Check if team has exactly 5 players - auto-create lineup with all players
          const rosterResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/team/${away_team_id}/roster?season_id=${fixtureSeason}`);
          const rosterData = await rosterResponse.json();
          
          let starters: string[] = [];
          let subs: string[] = [];
          
          if (rosterData.success && rosterData.players) {
            const activePlayers = rosterData.players.filter((p: any) => p.is_active);
            if (activePlayers.length === 5) {
              starters = activePlayers.map((p: any) => p.player_id);
              console.log(`✅ Auto-created lineup for away team ${away_team_id} with 5 players`);
            }
          }
          
          // No lineup submitted - create locked lineup (empty if not 5 players, auto-filled if exactly 5)
          const lineupId = `lineup_${fixture_id}_${away_team_id}`;
          await sql`INSERT INTO lineups (id, fixture_id, team_id, season_id, starters, substitutes, is_locked, locked_at, locked_by, locked_by_name, created_at, updated_at, submitted_by, submitted_by_name)
            VALUES (${lineupId}, ${fixture_id}, ${away_team_id}, ${fixtureSeason || ''}, ${JSON.stringify(starters)}, ${JSON.stringify(subs)}, true, ${now.toISOString()}, 'system', ${starters.length === 5 ? 'Auto-lock (5 Players)' : 'Auto-lock (Deadline - No Submission)'}, ${now.toISOString()}, ${now.toISOString()}, null, null)
            ON CONFLICT (fixture_id, team_id) DO UPDATE SET
              starters = EXCLUDED.starters, substitutes = EXCLUDED.substitutes,
              is_locked = true, locked_at = EXCLUDED.locked_at, locked_by = 'system',
              locked_by_name = EXCLUDED.locked_by_name, updated_at = EXCLUDED.updated_at`;
          results.push({ team_id: away_team_id, status: starters.length === 5 ? 'locked_auto_5' : 'locked_empty' });
          processedCount++;
        }

      } catch (err: any) {
        console.error(`Error processing lock for fixture ${fixture_id}:`, err);
        results.push({ 
          fixture_id, 
          status: 'error', 
          error: err.message 
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processedCount} lineup locks`,
      processed: processedCount,
      results
    });
  } catch (error: any) {
    console.error('Error processing lineup locks:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process locks' },
      { status: 500 }
    );
  }
}
