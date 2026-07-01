import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';

/**
 * POST - Declare a Walkover (one team absent)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { absent_team, declared_by, declared_by_name, notes } = body;

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'fixtureId is required' },
        { status: 400 }
      );
    }

    if (!absent_team || !['home', 'away'].includes(absent_team)) {
      return NextResponse.json(
        { error: 'Valid absent_team (home or away) is required' },
        { status: 400 }
      );
    }

    // Fetch fixture first
    const fixtures = await sql`
      SELECT id, season_id, round_number, match_number, home_team_name, away_team_name, tournament_id
      FROM fixtures
      WHERE id = ${fixtureId}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];

    // Award WO (typically 3-0 or similar score)
    const woScore = 3; 
    const matchStatusReason = absent_team === 'home' ? 'wo_home_absent' : 'wo_away_absent';
    const homeScore = absent_team === 'home' ? 0 : woScore;
    const awayScore = absent_team === 'away' ? 0 : woScore;
    const result = absent_team === 'home' ? 'away_win' : 'home_win';

    // Update fixture using valid columns
    await sql`
      UPDATE fixtures
      SET 
        status = 'completed',
        home_score = ${homeScore},
        away_score = ${awayScore},
        result = ${result},
        notes = ${notes || `Walkover declared - ${absent_team === 'home' ? 'Home' : 'Away'} team absent`},
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    // Log in audit trail using valid columns
    await sql`
      INSERT INTO fixture_audit_log (
        fixture_id,
        change_type,
        changed_by,
        changes,
        tournament_id
      ) VALUES (
        ${fixtureId},
        'wo_declared',
        ${declared_by_name || 'Committee Admin'},
        ${JSON.stringify({
          absent_team,
          home_score: homeScore,
          away_score: awayScore,
          result,
          reason: matchStatusReason,
          note: notes || `Walkover declared - ${absent_team === 'home' ? 'Home' : 'Away'} team absent`,
          season_id: fixture.season_id,
          round_number: fixture.round_number,
          match_number: fixture.match_number,
          declared_by: declared_by || 'system'
        })},
        ${fixture.tournament_id || null}
      )
    `;

    // Send FCM notification
    try {
      const winningTeamName = absent_team === 'home' ? fixture.away_team_name : fixture.home_team_name;
      const losingTeamName = absent_team === 'home' ? fixture.home_team_name : fixture.away_team_name;
      
      await sendNotificationToSeason(
        {
          title: '🏆 Walkover Declared',
          body: `${winningTeamName} awarded Walkover win against ${losingTeamName} (${absent_team === 'home' ? 'Home' : 'Away'} absent)`,
          url: `/fixtures/${fixtureId}`,
          icon: '/logo.png',
          data: {
            type: 'walkover',
            fixture_id: fixtureId,
            winner: winningTeamName,
            loser: losingTeamName,
          }
        },
        fixture.season_id
      );
    } catch (notifErr) {
      console.error('Failed to send declare-wo notification:', notifErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Walkover successfully declared',
    });
  } catch (error: any) {
    console.error('Error declaring Walkover:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to declare Walkover' },
      { status: 500 }
    );
  }
}
