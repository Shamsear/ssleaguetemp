import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { computeAwayLineupDeadline } from '@/lib/tournament/triple-threat-engine';

const sql = getTournamentDb();

/**
 * Check if opponent lineup selection is allowed
 * Requires: submission deadline has passed AND opponent has not submitted their lineup
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fixtureId = searchParams.get('fixture_id');
    const opponentTeamId = searchParams.get('opponent_team_id');

    if (!fixtureId || !opponentTeamId) {
      return NextResponse.json(
        { success: false, error: 'fixture_id and opponent_team_id are required' },
        { status: 400 }
      );
    }

    // Get fixture to check deadline and tournament type
    const fixtures = await sql`
      SELECT 
        f.id, f.lineup_deadline, f.tournament_id, f.season_id, f.round_number, f.leg,
        f.home_team_id, f.away_team_id,
        t.tournament_type, ts.matchday_format,
        rd.scheduled_date, rd.scheduled_date::text as scheduled_date_str, rd.away_fixture_deadline_time
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      LEFT JOIN round_deadlines rd ON (
        f.round_number = rd.round_number
        AND f.season_id = rd.season_id
        AND f.tournament_id = rd.tournament_id
        AND (f.leg IS NULL OR rd.leg IS NULL OR f.leg = rd.leg)
      )
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];
    const isTT =
      fixture.tournament_type === 'triple_threat' ||
      fixture.matchday_format === 'triple_threat' ||
      String(fixture.tournament_id || '').toLowerCase().includes('triple_threat');

    // Check if opponent has lineup
    const lineups = await sql`
      SELECT id, warning_given, selected_by_opponent, submitted_by, triple_threat_lineup, is_draft
      FROM lineups
      WHERE fixture_id = ${fixtureId}
        AND team_id = ${opponentTeamId}
      LIMIT 1
    `;

    const hasRealLineup =
      lineups.length > 0 &&
      !lineups[0].is_draft &&
      lineups[0].submitted_by !== 'system_auto' &&
      (isTT ? !!lineups[0].triple_threat_lineup : true);

    if (hasRealLineup) {
      if (lineups[0].selected_by_opponent) {
        return NextResponse.json({
          success: true,
          eligible: false,
          message: 'Opponent lineup has already been selected'
        });
      }

      return NextResponse.json({
        success: true,
        eligible: false,
        message: 'Opponent has already submitted their lineup'
      });
    }

    const now = new Date();
    const deadline = computeAwayLineupDeadline({
      scheduled_date: fixture.scheduled_date,
      scheduled_date_str: fixture.scheduled_date_str,
      away_fixture_deadline_time: fixture.away_fixture_deadline_time,
      lineup_deadline: fixture.lineup_deadline,
      isTripleThreat: isTT,
    });

    // Only eligible once the Away Team submission deadline has passed
    if (!deadline || now < deadline) {
      return NextResponse.json({
        success: true,
        eligible: false,
        deadline: deadline ? deadline.toISOString() : null,
        message: 'Submission deadline has not passed yet'
      });
    }

    return NextResponse.json({
      success: true,
      eligible: true,
      deadline: deadline.toISOString(),
      message: 'Opponent lineup selection is available'
    });
  } catch (error: any) {
    console.error('Error checking eligibility:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check eligibility' },
      { status: 500 }
    );
  }
}
