import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { verifyAuth } from '@/lib/auth-helper';
import { isRoundStartedFromDeadline, materializeTripleThreatMatchups } from '@/lib/lineup-validation';

// POST - Generate the 4 Triple Threat matchups (1 Co-op 2v2, 2 Duo 1v1s, 1 Single 1v1) from submitted lineups
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;

    const metaRows = await sql`
      SELECT f.id, f.status as fixture_status,
             rd.scheduled_date, rd.scheduled_date::text as scheduled_date_str,
             rd.round_start_time, rd.status as round_status
      FROM fixtures f
      LEFT JOIN round_deadlines rd ON (
        f.round_number = rd.round_number
        AND f.season_id = rd.season_id
        AND f.tournament_id = rd.tournament_id
        AND (f.leg IS NULL OR rd.leg IS NULL OR f.leg = rd.leg)
      )
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;

    if (metaRows.length === 0) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
    }

    const meta = metaRows[0];
    const roundStarted = isRoundStartedFromDeadline({
      round_status: meta.round_status,
      fixture_status: meta.fixture_status,
      scheduled_date: meta.scheduled_date,
      scheduled_date_str: meta.scheduled_date_str,
      round_start_time: meta.round_start_time,
    });

    if (!roundStarted) {
      const auth = await verifyAuth(undefined, request);
      const roleLower = String(auth.role || '').toLowerCase();
      const isAdmin = Boolean(
        auth.authenticated &&
        ['committee_admin', 'super_admin', 'superadmin', 'admin'].includes(roleLower)
      );
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Matchups cannot be generated before the round has started.' },
          { status: 403 }
        );
      }
    }

    const result = await materializeTripleThreatMatchups(sql, fixtureId);
    if (!result.created) {
      return NextResponse.json(
        { error: result.error || 'Could not generate Triple Threat matchups' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully generated 4 Triple Threat matchups across 3 modes!',
      matchups_count: result.matchupsCount
    });
  } catch (error: any) {
    console.error('Error generating Triple Threat matchups:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate Triple Threat matchups' },
      { status: 500 }
    );
  }
}
