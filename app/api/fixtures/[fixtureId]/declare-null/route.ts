import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';
import { syncPlayerStatsForSeason } from '@/lib/neon/sync-player-stats';
import { revertTeamStatsForFixture } from '@/lib/neon/team-stats-helper';

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
  if (host) return `${protocol}://${host}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

async function handleDeclareNull(
  request: NextRequest,
  params: Promise<{ fixtureId: string }>
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json().catch(() => ({}));
    const { declared_by, declared_by_name, notes, keep_fantasy_points } = body;

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'fixtureId is required' },
        { status: 400 }
      );
    }

    // Fetch fixture first to get details for logging, stats reversion, and notifications
    const fixtures = await sql`
      SELECT id, season_id, round_number, match_number, home_team_id, away_team_id, home_team_name, away_team_name, tournament_id
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
    const baseUrl = getBaseUrl(request);

    // 1. Update fixture status
    const defaultNote = keep_fantasy_points
      ? 'Match declared NULL (Fantasy Points Preserved)'
      : 'Match declared NULL - both teams absent';

    await sql`
      UPDATE fixtures
      SET 
        status = 'cancelled',
        home_score = 0,
        away_score = 0,
        result = 'null',
        notes = ${notes || defaultNote},
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    await sql`
      UPDATE matchups
      SET 
        is_null = true,
        updated_at = NOW()
      WHERE fixture_id = ${fixtureId}
    `;

    // 2. Revert team stats from standings (teamstats table)
    if (fixture.season_id && fixture.tournament_id) {
      try {
        console.log('📊 Reverting teamstats for null match:', fixtureId);
        await revertTeamStatsForFixture({
          fixtureId,
          seasonId: fixture.season_id,
          tournamentId: fixture.tournament_id,
          homeTeamId: fixture.home_team_id,
          awayTeamId: fixture.away_team_id,
          customDb: sql,
        });
        console.log('✅ Teamstats successfully reverted for null match');
      } catch (teamStatsErr) {
        console.error('Failed to revert teamstats on declare-null:', teamStatsErr);
      }
    }

    // 3. Delete passive team bonus points from fantasy
    try {
      const { getFantasyDb } = await import('@/lib/neon/fantasy-config');
      const fantasySql = getFantasyDb();
      await fantasySql`
        DELETE FROM fantasy_team_bonus_points
        WHERE fixture_id = ${fixtureId}
      `;
      console.log('✅ Deleted fantasy passive bonus points for fixture:', fixtureId);
    } catch (bonusErr) {
      console.error('Failed to delete passive bonus points on declare-null:', bonusErr);
    }

    // 4. Handle fantasy points
    if (keep_fantasy_points) {
      // Calculate/Update fantasy player points based on existing matchups
      try {
        console.log('⭐ Preserving/calculating fantasy player points for null match:', fixtureId);
        const recalcFantasyRes = await fetch(`${baseUrl}/api/fantasy/calculate-points`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fixture_id: fixtureId,
            season_id: fixture.season_id,
            round_number: fixture.round_number,
          })
        });

        if (recalcFantasyRes.ok) {
          console.log('✅ Fantasy player points updated successfully for null match');
        } else {
          console.log('ℹ️ Fantasy points calculation returned non-OK status');
        }
      } catch (fantasyErr) {
        console.error('Failed to update fantasy player points on declare-null:', fantasyErr);
      }
    } else {
      // Revert fantasy points for this cancelled fixture
      try {
        await fetch(`${baseUrl}/api/fantasy/revert-fixture-points`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fixture_id: fixtureId,
            season_id: fixture.season_id,
          })
        });
        console.log('✅ Fantasy points reverted for declare-null');
      } catch (fantasyErr) {
        console.error('Failed to revert fantasy points on declare-null:', fantasyErr);
      }
    }

    // 5. Sync player stats for this season to ensure cancelled fixtures are removed from realplayerstats
    if (fixture.season_id) {
      try {
        console.log('⚽ Syncing real player stats on declare-null for season:', fixture.season_id);
        await syncPlayerStatsForSeason(fixture.season_id);
        console.log('✅ Real player stats synced on declare-null');
      } catch (syncErr) {
        console.error('Failed to sync player stats on declare-null:', syncErr);
      }
    }

    // 6. Log in audit trail
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
          keep_fantasy_points: !!keep_fantasy_points,
          note: notes || defaultNote,
          season_id: fixture.season_id,
          round_number: fixture.round_number,
          match_number: fixture.match_number,
          declared_by: declared_by || 'system'
        })},
        ${fixture.tournament_id || null}
      )
    `;

    // 7. Send FCM notification
    try {
      await sendNotificationToSeason(
        {
          title: '❌ Match Cancelled',
          body: `${fixture.home_team_name} vs ${fixture.away_team_name} declared NULL${keep_fantasy_points ? ' (Fantasy Points Kept)' : ''}`,
          url: `/fixtures/${fixtureId}`,
          icon: '/logo.png',
          data: {
            type: 'match_cancelled',
            fixture_id: fixtureId,
            home_team: fixture.home_team_name,
            away_team: fixture.away_team_name,
            reason: 'both_absent',
            keep_fantasy_points: String(!!keep_fantasy_points),
          }
        },
        fixture.season_id
      );
    } catch (notifErr) {
      console.error('Failed to send declare-null notification:', notifErr);
    }

    // 8. Revalidate cache
    try {
      revalidatePath(`/fixtures/${fixtureId}`);
      revalidatePath(`/dashboard/team/fixtures/${fixtureId}`);
      revalidatePath(`/dashboard/committee/team-management/fixture/${fixtureId}`);
      if (fixture.tournament_id) {
        revalidatePath(`/tournaments/${fixture.tournament_id}/standings`);
      }
      revalidatePath('/fantasy/leaderboard');
    } catch (cacheErr) {
      console.error('Cache revalidation error (non-critical):', cacheErr);
    }

    return NextResponse.json({
      success: true,
      message: `Match successfully declared NULL${keep_fantasy_points ? ' (Fantasy points preserved)' : ''}`,
    });
  } catch (error: any) {
    console.error('Error declaring match NULL:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to declare match NULL' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  return handleDeclareNull(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  return handleDeclareNull(request, params);
}
