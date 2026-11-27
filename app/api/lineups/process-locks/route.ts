import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { autoPopulateStandardFivePlayerLineups } from '@/lib/lineup-validation';

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
    let fixturesQuery = `SELECT f.*, t.tournament_type, ts.matchday_format FROM fixtures f LEFT JOIN tournaments t ON f.tournament_id = t.id LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id WHERE f.lineup_deadline <= $1`;
    const params: any[] = [now.toISOString()];

    if (season_id) {
      params.push(season_id);
      fixturesQuery += ` AND f.season_id = $${params.length}`;
    }
    if (round_number) {
      params.push(parseInt(round_number));
      fixturesQuery += ` AND f.round_number = $${params.length}`;
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
      const isTripleThreat =
        fixture.tournament_type === 'triple_threat' ||
        fixture.matchday_format === 'triple_threat' ||
        String(fixture.tournament_id || '').toLowerCase().includes('triple_threat');

      try {
        // First auto-populate standard 5-player teams before locking
        if (!isTripleThreat) {
          await autoPopulateStandardFivePlayerLineups(sql, [
            {
              fixture_id,
              season_id: fixtureSeason,
              tournament_id: fixture.tournament_id,
              round_number: fixture.round_number,
              home_team_id,
              away_team_id,
              tournament_type: fixture.tournament_type,
              matchday_format: fixture.matchday_format,
              matchup_mode: fixture.matchup_mode,
            },
          ]);
        }

        // Lock home team lineup if exists and not already locked
        const homeLineupRows = await sql`SELECT * FROM lineups WHERE fixture_id = ${fixture_id} AND team_id = ${home_team_id} LIMIT 1`;

        if (homeLineupRows.length > 0) {
          const homeLineup = homeLineupRows[0];
          if (!homeLineup.is_locked) {
            await sql`UPDATE lineups SET is_locked = true, locked_at = ${now.toISOString()}, locked_by = 'system', updated_at = ${now.toISOString()} WHERE fixture_id = ${fixture_id} AND team_id = ${home_team_id}`;
            results.push({ team_id: home_team_id, status: 'locked' });
            processedCount++;
          }
        } else if (!isTripleThreat) {
          const lineupId = `lineup_${fixture_id}_${home_team_id}`;
          await sql`INSERT INTO lineups (id, fixture_id, team_id, round_number, season_id, tournament_id, starting_xi, substitutes, is_locked, locked_at, locked_by, is_valid, created_at, updated_at, submitted_by)
            VALUES (${lineupId}, ${fixture_id}, ${home_team_id}, ${fixture.round_number ?? 1}, ${fixtureSeason || ''}, ${fixture.tournament_id || null}, '[]'::jsonb, '[]'::jsonb, true, ${now.toISOString()}, 'system', false, ${now.toISOString()}, ${now.toISOString()}, 'system')
            ON CONFLICT (id) DO UPDATE SET
              is_locked = true, locked_at = EXCLUDED.locked_at, locked_by = 'system', updated_at = EXCLUDED.updated_at`;
          results.push({ team_id: home_team_id, status: 'locked_empty' });
          processedCount++;
        }

        // Lock away team lineup if exists and not already locked
        const awayLineupRows = await sql`SELECT * FROM lineups WHERE fixture_id = ${fixture_id} AND team_id = ${away_team_id} LIMIT 1`;

        if (awayLineupRows.length > 0) {
          const awayLineup = awayLineupRows[0];
          if (!awayLineup.is_locked) {
            await sql`UPDATE lineups SET is_locked = true, locked_at = ${now.toISOString()}, locked_by = 'system', updated_at = ${now.toISOString()} WHERE fixture_id = ${fixture_id} AND team_id = ${away_team_id}`;
            results.push({ team_id: away_team_id, status: 'locked' });
            processedCount++;
          }
        } else if (!isTripleThreat) {
          const lineupId = `lineup_${fixture_id}_${away_team_id}`;
          await sql`INSERT INTO lineups (id, fixture_id, team_id, round_number, season_id, tournament_id, starting_xi, substitutes, is_locked, locked_at, locked_by, is_valid, created_at, updated_at, submitted_by)
            VALUES (${lineupId}, ${fixture_id}, ${away_team_id}, ${fixture.round_number ?? 1}, ${fixtureSeason || ''}, ${fixture.tournament_id || null}, '[]'::jsonb, '[]'::jsonb, true, ${now.toISOString()}, 'system', false, ${now.toISOString()}, ${now.toISOString()}, 'system')
            ON CONFLICT (id) DO UPDATE SET
              is_locked = true, locked_at = EXCLUDED.locked_at, locked_by = 'system', updated_at = EXCLUDED.updated_at`;
          results.push({ team_id: away_team_id, status: 'locked_empty' });
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
