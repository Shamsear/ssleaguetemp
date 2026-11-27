import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { autoPopulateStandardFivePlayerLineups } from '@/lib/lineup-validation';

/**
 * POST /api/lineups/auto-populate
 * Automatically populate lineups in the `lineups` table for standard
 * (non-Triple Threat, non-blind_lineup) teams with exactly 5 players (minimum squad)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season_id, round_number, leg } = body;

    if (!season_id || !round_number) {
      return NextResponse.json(
        { error: 'Missing required fields: season_id, round_number' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();
    const legValue = leg || 'first';

    console.log(`🤖 Auto-populating lineups for Season ${season_id}, Round ${round_number}, Leg ${legValue}`);

    // Get all fixtures for this round (Triple Threat & blind_lineup are skipped in helper)
    const fixtures = await sql`
      SELECT 
        f.id as fixture_id,
        f.season_id,
        f.tournament_id,
        f.round_number,
        f.home_team_id,
        f.away_team_id,
        f.matchup_mode,
        t.tournament_type,
        ts.matchday_format
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE f.season_id = ${season_id}
        AND f.round_number = ${round_number}
        AND f.leg = ${legValue}
    `;

    console.log(`Found ${fixtures.length} fixtures`);

    const autoPopulatedCount = await autoPopulateStandardFivePlayerLineups(sql, fixtures as any[]);

    console.log(`\n✅ Auto-populated ${autoPopulatedCount} lineup(s)`);

    return NextResponse.json({
      success: true,
      message: `Auto-populated ${autoPopulatedCount} lineup(s) for teams with 5 players`,
      auto_populated: autoPopulatedCount,
    });

  } catch (error: any) {
    console.error('Error auto-populating lineups:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to auto-populate lineups' },
      { status: 500 }
    );
  }
}
