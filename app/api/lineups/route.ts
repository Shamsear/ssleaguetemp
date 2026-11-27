import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { verifyAuth } from '@/lib/auth-helper';
import {
  validateLineup,
  isLineupEditable,
  generateLineupId,
  hasSubmittedLineup,
  autoPopulateStandardFivePlayerLineups,
  isRoundStartedFromDeadline,
  resolveUserTeamIdForSeason,
  materializeTripleThreatMatchups
} from '@/lib/lineup-validation';
import { computeAwayLineupDeadline } from '@/lib/tournament/triple-threat-engine';

/**
 * GET - Fetch lineup(s)
 * Query params:
 * - fixture_id: required
 * - team_id: optional (if not provided, returns both teams' lineups)
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const searchParams = request.nextUrl.searchParams;
    const fixtureId = searchParams.get('fixture_id');
    const teamId = searchParams.get('team_id');

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'fixture_id is required' },
        { status: 400 }
      );
    }

    let fixtureMeta: any = null;
    try {
      const fixtureRes = await sql`
        SELECT f.id as fixture_id, f.season_id, f.round_number, f.tournament_id, f.leg,
               f.home_team_id, f.away_team_id, f.matchup_mode, f.status as fixture_status,
               t.tournament_type, ts.matchday_format,
               rd.scheduled_date, rd.scheduled_date::text as scheduled_date_str,
               rd.round_start_time, rd.status as round_status
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
      if (fixtureRes.length > 0) {
        fixtureMeta = fixtureRes[0];
        await autoPopulateStandardFivePlayerLineups(sql, fixtureRes as any[]);
      }
    } catch (autoErr) {
      console.error('Error fetching fixture metadata / auto-creating lineups:', autoErr);
    }

    const roundStarted = fixtureMeta
      ? isRoundStartedFromDeadline({
          round_status: fixtureMeta.round_status,
          fixture_status: fixtureMeta.fixture_status,
          scheduled_date: fixtureMeta.scheduled_date,
          scheduled_date_str: fixtureMeta.scheduled_date_str,
          round_start_time: fixtureMeta.round_start_time,
        })
      : false;

    const isTripleThreatFixture = Boolean(
      fixtureMeta && (
        fixtureMeta.tournament_type === 'triple_threat' ||
        fixtureMeta.matchday_format === 'triple_threat' ||
        String(fixtureMeta.tournament_id || '').toLowerCase().includes('triple_threat')
      )
    );

    const auth = await verifyAuth(undefined, request);
    const roleLower = String(auth.role || '').toLowerCase();
    const isAdmin = Boolean(
      auth.authenticated &&
      ['committee_admin', 'super_admin', 'superadmin', 'admin'].includes(roleLower)
    );
    const callerTeamId =
      auth.authenticated && auth.userId && !isAdmin
        ? await resolveUserTeamIdForSeason(auth.userId, fixtureMeta?.season_id)
        : null;

    let lineups;

    if (teamId) {
      // Get specific team's lineup - ONLY for that team
      lineups = await sql`
        SELECT 
          l.*,
          f.home_team_name,
          f.away_team_name,
          f.round_number
        FROM lineups l
        JOIN fixtures f ON l.fixture_id = f.id
        WHERE l.fixture_id = ${fixtureId}
        AND l.team_id = ${teamId}
        LIMIT 1
      `;

      // Additional verification: ensure the returned lineup matches requested team_id
      if (lineups.length > 0 && lineups[0].team_id !== teamId) {
        console.error('❌ SECURITY: Lineup team_id mismatch!', {
          requested: teamId,
          returned: lineups[0].team_id
        });
        return NextResponse.json(
          { error: 'Unauthorized access to lineup' },
          { status: 403 }
        );
      }
    } else {
      // Get both teams' lineups (for admin/committee views)
      lineups = await sql`
        SELECT 
          l.*,
          f.home_team_id,
          f.away_team_id,
          f.home_team_name,
          f.away_team_name,
          f.round_number
        FROM lineups l
        JOIN fixtures f ON l.fixture_id = f.id
        WHERE l.fixture_id = ${fixtureId}
      `;
    }

    const getCategoryPriority = (category?: string): number => {
      if (!category) return 99;
      const cat = category.toLowerCase().trim();
      if (cat === 'tier 1' || cat.includes('icon') || cat.includes('marquee') || cat.includes('legend') || cat === 'tier 0' || cat === 't1') return 1;
      if (cat === 'tier 2' || cat.includes('classic') || cat.includes('gold') || cat === 't2') return 2;
      if (cat === 'tier 3' || cat.includes('silver') || cat === 't3') return 3;
      if (cat === 'tier 4' || cat.includes('bronze') || cat === 't4') return 4;
      if (cat.includes('uncapped') || cat.includes('realplayer') || cat.includes('base') || cat.includes('local')) return 5;
      return 10;
    };

    // Get substitutions and sort starting_xi by category priority, redacting opponent lineup before round starts
    if (lineups.length > 0) {
      const lineupIds = lineups.map((l: any) => l.id);
      const substitutions = await sql`
        SELECT *
        FROM lineup_substitutions
        WHERE lineup_id = ANY(${lineupIds})
        ORDER BY made_at ASC
      `;

      lineups = lineups
        .map((l: any) => {
          const shouldHidePlayers = !isAdmin && !roundStarted && callerTeamId !== l.team_id;
          if (shouldHidePlayers) {
            const isRealSubmitted =
              !l.is_draft &&
              (isTripleThreatFixture
                ? l.submitted_by !== 'system_auto' && Boolean(l.triple_threat_lineup)
                : Array.isArray(l.starting_xi) && l.starting_xi.length >= 5);

            if (!isRealSubmitted) {
              return null;
            }

            return {
              id: l.id,
              fixture_id: l.fixture_id,
              team_id: l.team_id,
              round_number: l.round_number,
              is_draft: false,
              is_locked: Boolean(l.is_locked),
              submitted: true,
              submitted_at: l.submitted_at,
              selected_by_opponent: Boolean(l.selected_by_opponent),
              hidden_until_round_start: true,
              starting_xi: [],
              substitutes: [],
              triple_threat_lineup: null,
              substitutions: [],
            };
          }

          let startingXi = Array.isArray(l.starting_xi) ? [...l.starting_xi] : [];
          if (startingXi.some((item: any) => item && typeof item === 'object' && (item.category || item.player_name || item.name))) {
            startingXi.sort((a: any, b: any) => {
              const pA = typeof a === 'object' ? getCategoryPriority(a?.category) : 99;
              const pB = typeof b === 'object' ? getCategoryPriority(b?.category) : 99;
              if (pA !== pB) return pA - pB;
              const nameA = typeof a === 'object' ? (a?.player_name || a?.name || '') : '';
              const nameB = typeof b === 'object' ? (b?.player_name || b?.name || '') : '';
              return nameA.localeCompare(nameB);
            });
          }

          return {
            ...l,
            starting_xi: startingXi,
            substitutions: substitutions.filter((s: any) => s.lineup_id === l.id),
          };
        })
        .filter(Boolean);
    }

    const response = teamId
      ? (lineups.length > 0 ? lineups[0] : null)
      : lineups;

    return NextResponse.json({
      success: true,
      round_started: roundStarted,
      hidden_until_round_start: Boolean(teamId && !isAdmin && !roundStarted && callerTeamId !== teamId),
      lineups: response,
    });
  } catch (error: any) {
    console.error('Error fetching lineups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lineups' },
      { status: 500 }
    );
  }
}

/**
 * POST - Submit or update lineup
 */
export async function POST(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const body = await request.json();
    const {
      fixture_id,
      team_id,
      starting_xi,
      substitutes,
      triple_threat_lineup,
      submitted_by,
      submitted_by_name,
      selected_by_opponent,
      bypass_deadline, // NEW: Allow committee admins to bypass deadline
    } = body;

    console.log('📥 Lineup API - Received request:', {
      fixture_id,
      team_id,
      starting_xi_count: starting_xi?.length,
      substitutes_count: substitutes?.length,
      has_triple_threat: !!triple_threat_lineup,
      starting_xi,
      substitutes,
      submitted_by,
      selected_by_opponent: !!selected_by_opponent,
      bypass_deadline
    });

    // Determine starting_xi and substitutes if triple_threat_lineup is provided
    let finalStartingXi = starting_xi;
    let finalSubstitutes = substitutes || [];

    if (triple_threat_lineup && (!finalStartingXi || finalStartingXi.length === 0)) {
      finalStartingXi = [
        ...(triple_threat_lineup.coop || []).map((id: string, idx: number) => ({ player_id: id, mode: 'coop', slot: idx + 1 })),
        ...(triple_threat_lineup.duo || []).map((id: string, idx: number) => ({ player_id: id, mode: 'duo', slot: idx + 1 })),
        ...(triple_threat_lineup.single || []).map((id: string, idx: number) => ({ player_id: id, mode: 'single', slot: idx + 1 })),
      ];
    }

    // Validation
    if (!fixture_id || !team_id || (!finalStartingXi && !triple_threat_lineup) || !submitted_by) {
      console.error('❌ Missing required fields:', { fixture_id, team_id, starting_xi: finalStartingXi, submitted_by });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // CRITICAL: Verify the team_id is actually part of this fixture and fetch deadline metadata
    const fixtureCheck = await sql`
      SELECT
        f.home_team_id, f.away_team_id, f.tournament_id, f.status as fixture_status,
        t.tournament_type, ts.matchday_format,
        rd.scheduled_date, rd.scheduled_date::text as scheduled_date_str, rd.round_start_time, rd.home_fixture_deadline_time,
        rd.status as round_status
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      LEFT JOIN round_deadlines rd ON (
        f.round_number = rd.round_number
        AND f.season_id = rd.season_id
        AND f.tournament_id = rd.tournament_id
        AND (f.leg IS NULL OR rd.leg IS NULL OR f.leg = rd.leg)
      )
      WHERE f.id = ${fixture_id}
      LIMIT 1
    `;

    if (fixtureCheck.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const {
      home_team_id,
      away_team_id,
      tournament_id: checkedTournamentId,
      fixture_status,
      tournament_type,
      matchday_format,
      scheduled_date,
      scheduled_date_str,
      round_start_time,
      home_fixture_deadline_time,
      round_status,
    } = fixtureCheck[0];
    if (team_id !== home_team_id && team_id !== away_team_id) {
      console.error('❌ SECURITY: Team not part of fixture!', {
        team_id,
        home_team_id,
        away_team_id,
        fixture_id
      });
      return NextResponse.json(
        { error: 'Team is not part of this fixture' },
        { status: 403 }
      );
    }

    // Check if lineup can be edited (skip only if verified admin passes bypass_deadline)
    if (bypass_deadline) {
      const auth = await verifyAuth(['committee_admin', 'super_admin'], request);
      if (!auth.authenticated) {
        return NextResponse.json(
          { error: auth.error || 'Only committee or super admins can bypass lineup deadlines' },
          { status: 403 }
        );
      }
      console.log('⚠️ Bypassing deadline check (committee admin override)');
    } else if (selected_by_opponent) {
      const auth = await verifyAuth(['team', 'committee_admin', 'super_admin'], request);
      if (!auth.authenticated) {
        return NextResponse.json(
          { error: auth.error || 'Unauthorized to select opponent lineup' },
          { status: 401 }
        );
      }

      const isTT =
        tournament_type === 'triple_threat' ||
        matchday_format === 'triple_threat' ||
        String(checkedTournamentId || '').toLowerCase().includes('triple_threat');

      const existingOpp = await sql`
        SELECT submitted_by, is_draft, triple_threat_lineup, selected_by_opponent
        FROM lineups
        WHERE fixture_id = ${fixture_id} AND team_id = ${team_id}
        LIMIT 1
      `;
      const hasRealOppLineup =
        existingOpp.length > 0 &&
        !existingOpp[0].is_draft &&
        existingOpp[0].submitted_by !== 'system_auto' &&
        (isTT ? !!existingOpp[0].triple_threat_lineup : true);

      if (hasRealOppLineup) {
        return NextResponse.json(
          { error: existingOpp[0].selected_by_opponent ? 'Opponent lineup has already been selected' : 'Opponent has already submitted their lineup' },
          { status: 403 }
        );
      }

      const deadline = computeAwayLineupDeadline({
        scheduled_date,
        scheduled_date_str,
        round_start_time,
        home_fixture_deadline_time,
        isTripleThreat: isTT,
      });

      if (!deadline || new Date() < deadline) {
        return NextResponse.json(
          { error: 'Submission deadline has not passed yet. You can only submit on behalf of the opponent after the deadline.' },
          { status: 403 }
        );
      }
    } else {
      const editableCheck = await isLineupEditable(fixture_id, team_id);
      if (!editableCheck.editable) {
        // Check if it's because matchups exist
        const matchupsResult = await sql`
          SELECT COUNT(*) as count FROM matchups WHERE fixture_id = ${fixture_id}
        `;
        const matchupsExist = matchupsResult[0].count > 0;

        if (matchupsExist) {
          return NextResponse.json(
            {
              error: 'Lineup locked - matchups have been created',
              message: 'Matchups already exist for this fixture. To edit lineup, go to the fixture page and use the \"Edit Your Lineup\" button.',
              requires_confirmation: true
            },
            { status: 409 }
          );
        }

        return NextResponse.json(
          { error: editableCheck.reason || 'Lineup cannot be edited' },
          { status: 403 }
        );
      }
    }

    // Get fixture info
    const fixtures = await sql`
      SELECT season_id, round_number, tournament_id
      FROM fixtures
      WHERE id = ${fixture_id}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];

    // Validate lineup
    console.log('🔍 Validating lineup for:', { season_id: fixture.season_id, team_id, tournament_id: fixture.tournament_id });
    const validation = await validateLineup(
      { starting_xi: finalStartingXi, substitutes: finalSubstitutes, triple_threat_lineup },
      fixture.season_id,
      team_id,
      fixture.tournament_id
    );
    console.log('🔍 Validation result:', validation);

    if (!validation.isValid) {
      console.error('❌ Lineup validation failed:', validation.errors);
      return NextResponse.json(
        {
          error: 'Lineup validation failed',
          errors: validation.errors
        },
        { status: 400 }
      );
    }

    // Generate lineup ID based on fixture and team
    // This ensures each team has a unique lineup entry per fixture
    const lineupId = generateLineupId(fixture_id, team_id);

    console.log('💾 Saving lineup:', { lineupId, fixture_id, team_id });

    // Check if matchups exist - if so, delete them when lineup changes
    const matchupsResult = await sql`
      SELECT COUNT(*) as count FROM matchups WHERE fixture_id = ${fixture_id}
    `;
    const matchupsExist = matchupsResult[0].count > 0;
    let matchupsDeleted = false;

    if (matchupsExist) {
      console.log('🗑️ Deleting existing matchups due to lineup change');
      await sql`
        DELETE FROM matchups WHERE fixture_id = ${fixture_id}
      `;
      matchupsDeleted = true;
    }

    // Use UPSERT to handle both create and update in a single query
    // This prevents race conditions and handles both cases reliably
    await sql`
      INSERT INTO lineups (
        id,
        fixture_id,
        team_id,
        round_number,
        season_id,
        tournament_id,
        starting_xi,
        substitutes,
        triple_threat_lineup,
        classic_player_count,
        is_valid,
        validation_errors,
        selected_by_opponent,
        opponent_selector_id,
        opponent_selected_at,
        submitted_by,
        submitted_at,
        created_at,
        updated_at
      ) VALUES (
        ${lineupId},
        ${fixture_id},
        ${team_id},
        ${fixture.round_number},
        ${fixture.season_id},
        ${fixture.tournament_id},
        ${JSON.stringify(finalStartingXi)},
        ${JSON.stringify(finalSubstitutes)},
        ${triple_threat_lineup ? JSON.stringify(triple_threat_lineup) : null},
        ${validation.classicPlayerCount},
        ${validation.isValid},
        ${JSON.stringify(validation.errors)},
        ${Boolean(selected_by_opponent)},
        ${selected_by_opponent ? submitted_by : null},
        ${selected_by_opponent ? new Date().toISOString() : null},
        ${submitted_by},
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        starting_xi = EXCLUDED.starting_xi,
        substitutes = EXCLUDED.substitutes,
        triple_threat_lineup = EXCLUDED.triple_threat_lineup,
        classic_player_count = EXCLUDED.classic_player_count,
        is_valid = EXCLUDED.is_valid,
        validation_errors = EXCLUDED.validation_errors,
        selected_by_opponent = EXCLUDED.selected_by_opponent,
        opponent_selector_id = EXCLUDED.opponent_selector_id,
        opponent_selected_at = EXCLUDED.opponent_selected_at,
        submitted_by = EXCLUDED.submitted_by,
        submitted_at = EXCLUDED.submitted_at,
        is_draft = false,
        updated_at = NOW()
    `;

    // Also mark lineup as submitted on the fixture itself
    try {
      if (team_id === home_team_id) {
        await sql`
          UPDATE fixtures
          SET home_lineup_submitted = true,
              home_lineup_submitted_at = NOW(),
              home_lineup_submitted_by = ${submitted_by}
          WHERE id = ${fixture_id}
        `;
      } else if (team_id === away_team_id) {
        await sql`
          UPDATE fixtures
          SET away_lineup_submitted = true,
              away_lineup_submitted_at = NOW(),
              away_lineup_submitted_by = ${submitted_by}
          WHERE id = ${fixture_id}
        `;
      }
    } catch (fixErr) {
      console.warn('Could not update fixture submission flags:', fixErr);
    }

    // For Triple Threat, auto-create the 3 mode matchups only once the round has started
    if (triple_threat_lineup) {
      const roundStarted = isRoundStartedFromDeadline({
        round_status,
        fixture_status,
        scheduled_date,
        scheduled_date_str,
        round_start_time,
      });

      if (roundStarted) {
        try {
          const matResult = await materializeTripleThreatMatchups(sql, fixture_id);
          if (matResult.created) {
            console.log(`✅ Auto-created ${matResult.matchupsCount} Triple Threat matchups for fixture ${fixture_id}`);
          }
        } catch (ttErr) {
          console.error('Failed to auto-create Triple Threat matchups:', ttErr);
        }
      } else {
        console.log(`⏳ Deferring Triple Threat matchup creation for fixture ${fixture_id} until round starts`);
      }
    }

    return NextResponse.json({
      success: true,
      message: matchupsDeleted ? 'Lineup saved successfully. Matchups have been deleted and need to be recreated.' : 'Lineup saved successfully',
      lineup_id: lineupId,
      validation,
      matchups_deleted: matchupsDeleted,
    });
  } catch (error: any) {
    console.error('Error submitting lineup:', error);
    return NextResponse.json(
      { error: 'Failed to submit lineup', details: error.message },
      { status: 500 }
    );
  }
}
