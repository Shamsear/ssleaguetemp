import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

const sql = getTournamentDb();

/**
 * Check if opponent lineup selection is allowed
 * Requires: lineup deadline passed + warning given
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
        rd.scheduled_date, rd.away_fixture_deadline_time
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      LEFT JOIN round_deadlines rd ON (f.round_number = rd.round_number AND f.season_id = rd.season_id AND f.tournament_id = rd.tournament_id)
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
    const isTT = fixture.tournament_type === 'triple_threat' || fixture.matchday_format === 'triple_threat';

    // Check if opponent has lineup
    const lineups = await sql`
      SELECT id, warning_given, selected_by_opponent, submitted_by, triple_threat_lineup
      FROM lineups
      WHERE fixture_id = ${fixtureId}
        AND team_id = ${opponentTeamId}
      LIMIT 1
    `;

    const hasRealLineup = lineups.length > 0 && 
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

    if (isTT) {
      // In Triple Threat: Home team can submit Away lineup on their behalf (e.g. if shared in WhatsApp or missed 2:00 PM deadline)
      return NextResponse.json({
        success: true,
        eligible: true,
        message: 'Opponent lineup submission is available'
      });
    }

    const now = new Date();
    const deadline = fixture.lineup_deadline ? new Date(fixture.lineup_deadline) : null;

    // Check if deadline has passed for standard tournaments
    if (!deadline || now < deadline) {
      return NextResponse.json({
        success: true,
        eligible: false,
        message: 'Deadline has not passed yet'
      });
    }

    return NextResponse.json({
      success: true,
      eligible: true,
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
