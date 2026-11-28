import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import {
  computeISTResultDeadline,
  resolveFixtureDisplayStatus,
  resolveRoundDeadlineStatus,
} from '@/lib/utils/timezone';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { syncPlayerStatsForSeason } from '@/lib/neon/sync-player-stats';

// GET - Fetch a single fixture by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'fixtureId is required' },
        { status: 400 }
      );
    }

    // Fetch the fixture from Neon with tournament scoring type
    let fixtures = await sql`
      SELECT 
        f.*,
        ts.scoring_type,
        ts.matchday_format,
        ts.clean_sweep_bonus,
        ts.points_as_gd,
        t.tournament_type
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;

    // Fallback 1: Try case-insensitive or trimmed ID match
    if (fixtures.length === 0) {
      fixtures = await sql`
        SELECT 
          f.*,
          ts.scoring_type,
          ts.matchday_format,
          ts.clean_sweep_bonus,
          ts.points_as_gd,
          t.tournament_type
        FROM fixtures f
        LEFT JOIN tournaments t ON f.tournament_id = t.id
        LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
        WHERE LOWER(f.id) = ${fixtureId.toLowerCase()}
        LIMIT 1
      `;
    }

    // Fallback 2: Parse patterns like SSPSLS18L_leg1_r1_m1 or SSPSLS18_r1_m1
    if (fixtures.length === 0) {
      const matchPattern = fixtureId.match(/^([A-Za-z0-9]+)_(?:leg(\d+)_)?r(\d+)_m(\d+)$/i);
      if (matchPattern) {
        const [, rawSeason, legNumStr, roundNumStr, matchNumStr] = matchPattern;
        const cleanSeason = rawSeason.replace(/L$/i, '');
        const roundNum = parseInt(roundNumStr);
        const matchNum = parseInt(matchNumStr);

        fixtures = await sql`
          SELECT 
            f.*,
            ts.scoring_type
          FROM fixtures f
          LEFT JOIN tournaments t ON f.tournament_id = t.id
          LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
          WHERE (f.season_id = ${cleanSeason} OR f.season_id = ${rawSeason} OR f.tournament_id LIKE ${cleanSeason + '%'})
            AND f.round_number = ${roundNum}
            AND f.match_number = ${matchNum}
          LIMIT 1
        `;
      }
    }

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];

    // Helper to get team logo with multi-tier fallbacks across Neon and Firebase
    const getTeamLogo = async (teamId: string, seasonId: string, teamName: string) => {
      if (!teamId || teamId === 'TBD' || teamId === 'bye') return null;
      try {
        // 1. Check Neon team_seasons table first
        if (seasonId) {
          const tsRes = await sql`
            SELECT team_logo, logo_url
            FROM team_seasons
            WHERE (team_id = ${teamId} OR LOWER(team_name) = ${teamName ? teamName.toLowerCase() : ''})
              AND season_id = ${seasonId}
            LIMIT 1
          `;
          if (tsRes.length > 0) {
            if (tsRes[0].team_logo) return tsRes[0].team_logo;
            if (tsRes[0].logo_url) return tsRes[0].logo_url;
          }
        }

        // 2. Check Neon teams table directly
        const tRes = await sql`
          SELECT logo_url, team_logo FROM teams
          WHERE id = ${teamId} OR LOWER(name) = ${teamName ? teamName.toLowerCase() : ''}
          LIMIT 1
        `;
        if (tRes.length > 0) {
          if (tRes[0].logo_url) return tRes[0].logo_url;
          if (tRes[0].team_logo) return tRes[0].team_logo;
        }

        // 3. Fallback: check Firebase team_seasons collection
        if (seasonId) {
          try {
            const fbTs = await adminDb.collection('team_seasons')
              .where('season_id', '==', seasonId)
              .get();
            for (const doc of fbTs.docs) {
              const d = doc.data();
              if (doc.id === teamId || d.team_id === teamId || (teamName && d.team_name && d.team_name.toLowerCase() === teamName.toLowerCase())) {
                const logo = d.team_logo || d.logo_url || d.logoUrl;
                if (logo) return logo;
              }
            }
          } catch (e) {
            console.error('Firebase team_seasons logo lookup error:', e);
          }
        }

        // 4. Fallback: check Firebase teams collection
        try {
          const fbTeams = await adminDb.collection('teams').get();
          for (const doc of fbTeams.docs) {
            const d = doc.data();
            if (doc.id === teamId || (teamName && ((d.name && d.name.toLowerCase() === teamName.toLowerCase()) || (d.team_name && d.team_name.toLowerCase() === teamName.toLowerCase())))) {
              const logo = d.logo_url || d.logoUrl || d.logoURL || d.team_logo;
              if (logo) return logo;
            }
          }
        } catch (e) {
          console.error('Firebase teams logo lookup error:', e);
        }

        // 5. Fallback: check Firebase users collection
        try {
          const fbUsers = await adminDb.collection('users').get();
          for (const doc of fbUsers.docs) {
            const d = doc.data();
            if (d.team_id === teamId || (teamName && d.team_name && d.team_name.toLowerCase() === teamName.toLowerCase())) {
              const logo = d.logoUrl || d.photoUrl || d.logo_url || d.team_logo;
              if (logo) return logo;
            }
          }
        } catch (e) {
          console.error('Firebase users logo lookup error:', e);
        }

        // 6. Check any season in Neon team_seasons
        const tsAny = await sql`
          SELECT team_logo, logo_url FROM team_seasons
          WHERE team_id = ${teamId} OR LOWER(team_name) = ${teamName ? teamName.toLowerCase() : ''}
          LIMIT 1
        `;
        if (tsAny.length > 0) {
          if (tsAny[0].team_logo) return tsAny[0].team_logo;
          if (tsAny[0].logo_url) return tsAny[0].logo_url;
        }
      } catch (err: any) {
        console.error('Error getting logo for team', teamId, err);
      }
      return null;
    };

    let resolvedGroupName =
      fixture.group_name ||
      (!fixture.knockout_round ? String(fixture.id || '').match(/_grp([A-Za-z0-9]+)_/)?.[1] || null : null);

    if (!resolvedGroupName && fixture.tournament_id && !fixture.knockout_round && fixture.home_team_id) {
      try {
        const grpRes = await sql`
          SELECT group_name
          FROM tournament_team_groups
          WHERE tournament_id = ${fixture.tournament_id}
            AND team_id = ${fixture.home_team_id}
          LIMIT 1
        `;
        if (grpRes.length > 0 && grpRes[0].group_name) {
          resolvedGroupName = grpRes[0].group_name;
        }
      } catch (grpErr) {
        console.warn('Error resolving group_name from tournament_team_groups:', grpErr);
      }
    }

    const [home_team_logo, away_team_logo, deadlineRows] = await Promise.all([
      getTeamLogo(fixture.home_team_id, fixture.season_id, fixture.home_team_name),
      getTeamLogo(fixture.away_team_id, fixture.season_id, fixture.away_team_name),
      sql`
        SELECT status, scheduled_date, round_start_time
        FROM round_deadlines
        WHERE (tournament_id = ${fixture.tournament_id || ''} OR season_id = ${fixture.season_id || ''})
          AND round_number = ${fixture.round_number}
          AND leg = ${fixture.leg || 'first'}
        ORDER BY CASE WHEN tournament_id = ${fixture.tournament_id || ''} THEN 0 ELSE 1 END
        LIMIT 1
      `,
    ]);

    const deadline = deadlineRows[0] || null;
    const roundStatus = resolveRoundDeadlineStatus(deadline);

    const fixtureWithLogos = {
      ...fixture,
      raw_status: fixture.status,
      round_status: roundStatus,
      status: resolveFixtureDisplayStatus(fixture.status, roundStatus),
      scheduled_date: fixture.scheduled_date || deadline?.scheduled_date || null,
      group_name: resolvedGroupName,
      home_team_logo,
      away_team_logo
    };

    return NextResponse.json({ fixture: fixtureWithLogos });
  } catch (error: any) {
    console.error('Error fetching fixture:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fixture' },
      { status: 500 }
    );
  }
}

// PATCH - Update fixture MOTM and penalty goals
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { motm_player_id, motm_player_name, home_penalty_goals, away_penalty_goals } = body;

    // Check result entry deadline
    const fixtures = await sql`
      SELECT season_id, round_number, leg
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

    const { season_id, round_number, leg } = fixtures[0];

    // Get round deadlines
    const deadlines = await sql`
      SELECT scheduled_date::text as scheduled_date_str, scheduled_date, result_entry_deadline_time, result_entry_deadline_day_offset
      FROM round_deadlines
      WHERE season_id = ${season_id}
      AND round_number = ${round_number}
      AND leg = ${leg}
      LIMIT 1
    `;

    // Deadline check disabled - phase logic on frontend controls access
    // The frontend already checks if we're in result_entry phase before allowing MOTM/penalty updates
    if (deadlines.length > 0 && (deadlines[0].scheduled_date_str || deadlines[0].scheduled_date)) {
      const deadline = deadlines[0];
      const resultDeadline = computeISTResultDeadline(
        deadline.scheduled_date_str || deadline.scheduled_date,
        deadline.result_entry_deadline_day_offset,
        deadline.result_entry_deadline_time
      );
      const now = new Date();

      console.log('MOTM/Penalty update - Deadline info:', {
        now: now.toISOString(),
        deadline: resultDeadline.toISOString(),
        isPassed: now >= resultDeadline
      });

      const { is_admin, user_role, entered_by } = body;
      const isAdmin = is_admin || user_role === 'admin' || user_role === 'committee' || entered_by === 'admin';

      if (!isAdmin && now >= resultDeadline) {
        return NextResponse.json(
          { 
            error: 'Result entry deadline has passed',
            deadline: resultDeadline.toISOString()
          },
          { status: 403 }
        );
      }
    }

    // Update MOTM and penalty goals for fixture
    await sql`
      UPDATE fixtures
      SET 
        motm_player_id = ${motm_player_id || null},
        motm_player_name = ${motm_player_name || null},
        home_penalty_goals = ${home_penalty_goals || 0},
        away_penalty_goals = ${away_penalty_goals || 0},
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    // Re-sync player stats if MOTM was updated
    if (season_id && motm_player_id !== undefined) {
      try {
        console.log('⚽ Re-syncing player stats after MOTM update for season:', season_id);
        await syncPlayerStatsForSeason(season_id);
        console.log('✅ Player stats re-synced after MOTM update');
      } catch (syncErr) {
        console.error('Failed to sync player stats after MOTM update:', syncErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Match details updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating MOTM:', error);
    return NextResponse.json(
      { error: 'Failed to update match details' },
      { status: 500 }
    );
  }
}
