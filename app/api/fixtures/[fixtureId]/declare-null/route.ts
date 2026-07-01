import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';

/**
 * POST - Declare a match NULL (both teams absent)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { declared_by, declared_by_name, notes } = body;

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'fixtureId is required' },
        { status: 400 }
      );
    }

    // Fetch fixture first to get details for logging and notifications
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

    // Update fixture status using valid columns
    await sql`
      UPDATE fixtures
      SET 
        status = 'cancelled',
        notes = ${notes || 'Match declared NULL - both teams absent'},
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
        'null_declared',
        ${declared_by_name || 'Committee Admin'},
        ${JSON.stringify({
          reason: 'both_teams_absent',
          note: notes || 'Match declared NULL - both teams absent',
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
      await sendNotificationToSeason(
        {
          title: '❌ Match Cancelled',
          body: `${fixture.home_team_name} vs ${fixture.away_team_name} declared NULL - both teams absent`,
          url: `/fixtures/${fixtureId}`,
          icon: '/logo.png',
          data: {
            type: 'match_cancelled',
            fixture_id: fixtureId,
            home_team: fixture.home_team_name,
            away_team: fixture.away_team_name,
            reason: 'both_absent',
          }
        },
        fixture.season_id
      );
    } catch (notifErr) {
      console.error('Failed to send declare-null notification:', notifErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Match successfully declared NULL',
    });
  } catch (error: any) {
    console.error('Error declaring match NULL:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to declare match NULL' },
      { status: 500 }
    );
  }
}
