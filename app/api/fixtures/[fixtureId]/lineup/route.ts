import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';

interface LineupPlayer {
  player_id: string;
  player_name: string;
  position: number;
  is_substitute: boolean;
}

/**
 * Log lineup changes to audit trail
 */
async function logLineupChange(params: {
  fixtureId: string;
  teamId: string;
  action: 'created' | 'updated' | 'deleted';
  previousLineup: any;
  newLineup: any;
  changedBy: string;
  reason?: string;
  matchupsDeleted?: boolean;
}) {
  const sql = getTournamentDb();
  const { fixtureId, teamId, action, previousLineup, newLineup, changedBy, reason, matchupsDeleted } = params;

  try {
    await sql`
      INSERT INTO lineup_audit_log (
        fixture_id,
        team_id,
        action,
        previous_lineup,
        new_lineup,
        changed_by,
        reason,
        matchups_deleted
      ) VALUES (
        ${fixtureId},
        ${teamId},
        ${action},
        ${previousLineup ? JSON.stringify(previousLineup) : null}::jsonb,
        ${newLineup ? JSON.stringify(newLineup) : null}::jsonb,
        ${changedBy},
        ${reason || null},
        ${matchupsDeleted || false}
      )
    `;
    console.log(`✅ Logged lineup ${action} for team ${teamId}`);
  } catch (error: any) {
    console.error('Failed to log lineup change:', error);
    // Don't fail the request if audit logging fails
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const { fixtureId } = await params;
    
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = auth.userId!;

    // Get request body
    const body = await request.json();
    const { players } = body as { players: LineupPlayer[] };

    // Validate lineup
    if (!players || players.length !== 6) {
      return NextResponse.json(
        { success: false, error: 'Lineup must have exactly 6 players' },
        { status: 400 }
      );
    }

    const substituteCount = players.filter((p: any) => p.is_substitute).length;
    if (substituteCount !== 1) {
      return NextResponse.json(
        { success: false, error: 'Lineup must have exactly 1 substitute' },
        { status: 400 }
      );
    }

    // Get fixture from Neon
    const { getTournamentDb } = await import('@/lib/neon/tournament-config');
    const sql = getTournamentDb();
    
    const fixtures = await sql`
      SELECT * FROM fixtures WHERE id = ${fixtureId} LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];

    // Get team_id from team_seasons
    const teamSeasonsQuery = await adminDb
      .collection('team_seasons')
      .where('user_id', '==', userId)
      .where('season_id', '==', fixture.season_id)
      .where('status', '==', 'registered')
      .limit(1)
      .get();

    if (teamSeasonsQuery.empty) {
      return NextResponse.json(
        { success: false, error: 'Team not registered for this season' },
        { status: 403 }
      );
    }

    const teamId = teamSeasonsQuery.docs[0].data().team_id;
    const isHomeTeam = fixture.home_team_id === teamId;
    const isAwayTeam = fixture.away_team_id === teamId;

    if (!isHomeTeam && !isAwayTeam) {
      return NextResponse.json(
        { success: false, error: 'Not authorized for this fixture' },
        { status: 403 }
      );
    }

    // Check if lineup is already locked in database
    const existingLineup = isHomeTeam ? fixture.home_lineup : fixture.away_lineup;
    if (existingLineup && existingLineup.locked === true) {
      return NextResponse.json(
        { success: false, error: 'Lineup is locked and cannot be modified.' },
        { status: 403 }
      );
    }

    // Get round deadlines from Neon to determine phase
    const seasonId = fixture.season_id;
    const roundNumber = fixture.round_number;
    const leg = fixture.leg || 'first';

    const roundDeadlines = await sql`
      SELECT * FROM round_deadlines 
      WHERE season_id = ${seasonId}
        AND round_number = ${roundNumber}
        AND leg = ${leg}
      LIMIT 1
    `;

    if (roundDeadlines.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Round configuration not found' },
        { status: 404 }
      );
    }

    const roundData = roundDeadlines[0];
    const now = new Date();

    // Calculate deadlines in IST (UTC+5:30)
    const scheduledDate = roundData.scheduled_date;
    if (!scheduledDate) {
      return NextResponse.json(
        { success: false, error: 'Round not scheduled yet' },
        { status: 400 }
      );
    }

    const baseDateStr = new Date(scheduledDate).toISOString().split('T')[0]; // YYYY-MM-DD
    const [homeHour, homeMin] = (roundData.home_fixture_deadline_time || '17:00').split(':').map(Number);
    const [awayHour, awayMin] = (roundData.away_fixture_deadline_time || '17:00').split(':').map(Number);

    // Create deadlines in UTC by converting from IST
    const homeDeadline = new Date(baseDateStr);
    homeDeadline.setUTCHours(homeHour - 5, homeMin - 30, 0, 0); // Convert IST to UTC

    const awayDeadline = new Date(baseDateStr);
    awayDeadline.setUTCHours(awayHour - 5, awayMin - 30, 0, 0); // Convert IST to UTC

    // Determine current phase
    const isHomePhase = now < homeDeadline;
    const isAwayPhase = now >= homeDeadline && now < awayDeadline;
    const isLocked = now >= awayDeadline;

    console.log('Lineup submission deadline check:', {
      now: now.toISOString(),
      homeDeadline: homeDeadline.toISOString(),
      awayDeadline: awayDeadline.toISOString(),
      isHomePhase,
      isAwayPhase,
      isLocked,
      teamType: isHomeTeam ? 'home' : 'away'
    });

    if (isLocked) {
      return NextResponse.json(
        { success: false, error: 'Fixture lineup is locked. Deadline has passed.' },
        { status: 403 }
      );
    }

    // Check permissions based on phase
    const homeSubmitted = !!fixture.home_lineup_submitted_at;
    const awaySubmitted = !!fixture.away_lineup_submitted_at;

    if (isHomePhase) {
      // HOME PHASE: Only home team can submit
      if (!isHomeTeam) {
        return NextResponse.json(
          { success: false, error: 'Only home team can submit during home fixture phase' },
          { status: 403 }
        );
      }
    } else if (isAwayPhase) {
      // AWAY PHASE: First to submit gets exclusive rights
      if (isHomeTeam) {
        // Home team trying to submit/edit
        if (!homeSubmitted) {
          // Home didn't submit yet
          if (awaySubmitted) {
            // Away already submitted first
            return NextResponse.json(
              { success: false, error: 'Away team submitted first. You cannot edit now.' },
              { status: 403 }
            );
          }
          // Home can submit now
        }
        // Home already submitted, can continue editing
      } else {
        // Away team trying to submit/edit
        if (!awaySubmitted) {
          // Away didn't submit yet
          if (homeSubmitted) {
            // Home already submitted first
            return NextResponse.json(
              { success: false, error: 'Home team submitted first. You cannot edit now.' },
              { status: 403 }
            );
          }
          // Away can submit now
        }
        // Away already submitted, can continue editing
      }
    }

    // Check if matchups exist
    const existingMatchups = await sql`
      SELECT COUNT(*) as count FROM matchups WHERE fixture_id = ${fixtureId}
    `;
    const matchupsExist = existingMatchups[0].count > 0;

    // If matchups exist, prevent lineup changes (they should use PUT with delete_matchups flag)
    if (matchupsExist) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Lineup locked - matchups have been created',
          message: 'Matchups already exist for this fixture. To edit lineup, you must delete matchups first.',
          requires_confirmation: true
        },
        { status: 409 }
      );
    }

    // Save lineup to Neon
    const lineupData = {
      players: players,
      locked: false,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
    };

    // Get previous lineup for audit
    const previousLineup = isHomeTeam ? fixture.home_lineup : fixture.away_lineup;
    const isNewSubmission = isHomeTeam ? !homeSubmitted : !awaySubmitted;
    const submissionTime = new Date();

    // Check if this is a late submission (after away deadline)
    const isLateSubmission = submissionTime > awayDeadline;

    if (isHomeTeam) {
      if (isNewSubmission) {
        await sql`
          UPDATE fixtures
          SET 
            home_lineup = ${JSON.stringify(lineupData)}::jsonb,
            home_lineup_submitted_at = NOW(),
            home_lineup_submitted_by = ${userId},
            lineup_last_edited_by = ${userId},
            lineup_last_edited_at = NOW(),
            updated_at = NOW()
          WHERE id = ${fixtureId}
        `;
      } else {
        await sql`
          UPDATE fixtures
          SET 
            home_lineup = ${JSON.stringify(lineupData)}::jsonb,
            lineup_last_edited_by = ${userId},
            lineup_last_edited_at = NOW(),
            updated_at = NOW()
          WHERE id = ${fixtureId}
        `;
      }
    } else {
      if (isNewSubmission) {
        await sql`
          UPDATE fixtures
          SET 
            away_lineup = ${JSON.stringify(lineupData)}::jsonb,
            away_lineup_submitted_at = NOW(),
            away_lineup_submitted_by = ${userId},
            lineup_last_edited_by = ${userId},
            lineup_last_edited_at = NOW(),
            updated_at = NOW()
          WHERE id = ${fixtureId}
        `;
      } else {
        await sql`
          UPDATE fixtures
          SET 
            away_lineup = ${JSON.stringify(lineupData)}::jsonb,
            lineup_last_edited_by = ${userId},
            lineup_last_edited_at = NOW(),
            updated_at = NOW()
          WHERE id = ${fixtureId}
        `;
      }
    }

    // If this is a late submission, record violation and apply penalty
    if (isNewSubmission && isLateSubmission) {
      const minutesLate = Math.round((submissionTime.getTime() - awayDeadline.getTime()) / 60000);
      console.log(`⚠️  LATE SUBMISSION DETECTED: ${teamId} submitted ${minutesLate} minutes late`);
      
      try {
        // Record violation
        await sql`
          INSERT INTO team_violations (
            team_id,
            season_id,
            violation_type,
            fixture_id,
            round_number,
            violation_date,
            deadline,
            minutes_late,
            penalty_applied,
            penalty_amount,
            notes
          ) VALUES (
            ${teamId},
            ${seasonId},
            'late_lineup',
            ${fixtureId},
            ${roundNumber},
            NOW(),
            ${awayDeadline.toISOString()},
            ${minutesLate},
            'warning_deducted',
            1,
            ${'Lineup submitted ' + minutesLate + ' minutes after deadline'}
          )
        `;
        
        console.log(`✅ Violation recorded for team ${teamId}`);
        
        // TODO: Deduct warning chance from team_seasons in Firebase
        // This would require updating Firebase team_seasons document
        
      } catch (violationError) {
        console.error('Failed to record violation:', violationError);
        // Don't fail the request, but log the error
      }
    }

    // Log the change
    const teamSeasonsData = teamSeasonsQuery.docs[0].data();
    await logLineupChange({
      fixtureId,
      teamId: teamSeasonsData.team_id,
      action: isNewSubmission ? 'created' : 'updated',
      previousLineup,
      newLineup: lineupData,
      changedBy: userId,
      reason: isNewSubmission ? 'Initial lineup submission' : 'Lineup updated'
    });

    // NOTE: Automatic round robin matchup generation has been disabled
    // because lineups are now stored in the 'lineups' table, not in fixtures.home_lineup/away_lineup
    // Use the admin button "Auto-Generate Round Robin" in the committee fixture page instead

    return NextResponse.json({
      success: true,
      message: 'Lineup saved successfully'
    });
  } catch (error: any) {
    console.error('Error saving lineup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save lineup' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const { fixtureId } = await params;
    
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = auth.userId!;

    // Get request body
    const body = await request.json();
    const { players, delete_matchups } = body as { players: LineupPlayer[], delete_matchups?: boolean };

    // Validate lineup
    if (!players || players.length !== 6) {
      return NextResponse.json(
        { success: false, error: 'Lineup must have exactly 6 players' },
        { status: 400 }
      );
    }

    const substituteCount = players.filter((p: any) => p.is_substitute).length;
    if (substituteCount !== 1) {
      return NextResponse.json(
        { success: false, error: 'Lineup must have exactly 1 substitute' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();
    
    const fixtures = await sql`
      SELECT * FROM fixtures WHERE id = ${fixtureId} LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];

    // Get team_id from team_seasons
    const teamSeasonsQuery = await adminDb
      .collection('team_seasons')
      .where('user_id', '==', userId)
      .where('season_id', '==', fixture.season_id)
      .where('status', '==', 'registered')
      .limit(1)
      .get();

    if (teamSeasonsQuery.empty) {
      return NextResponse.json(
        { success: false, error: 'Team not registered for this season' },
        { status: 403 }
      );
    }

    const teamId = teamSeasonsQuery.docs[0].data().team_id;
    const isHomeTeam = fixture.home_team_id === teamId;
    const isAwayTeam = fixture.away_team_id === teamId;

    if (!isHomeTeam && !isAwayTeam) {
      return NextResponse.json(
        { success: false, error: 'Not authorized for this fixture' },
        { status: 403 }
      );
    }

    // Check if lineup is already locked in database
    const existingLineup = isHomeTeam ? fixture.home_lineup : fixture.away_lineup;
    if (existingLineup && existingLineup.locked === true) {
      return NextResponse.json(
        { success: false, error: 'Lineup is locked and cannot be modified.' },
        { status: 403 }
      );
    }

    // Get round deadlines to check if editing is allowed
    const seasonId = fixture.season_id;
    const roundNumber = fixture.round_number;
    const leg = fixture.leg || 'first';

    const roundDeadlines = await sql`
      SELECT * FROM round_deadlines 
      WHERE season_id = ${seasonId}
        AND round_number = ${roundNumber}
        AND leg = ${leg}
      LIMIT 1
    `;

    if (roundDeadlines.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Round configuration not found' },
        { status: 404 }
      );
    }

    const roundData = roundDeadlines[0];
    const now = new Date();

    // Calculate deadlines
    const scheduledDate = roundData.scheduled_date;
    if (!scheduledDate) {
      return NextResponse.json(
        { success: false, error: 'Round not scheduled yet' },
        { status: 400 }
      );
    }

    const homeDeadline = new Date(`${scheduledDate}T${roundData.home_fixture_deadline_time}:00+05:30`);
    const awayDeadline = new Date(`${scheduledDate}T${roundData.away_fixture_deadline_time}:00+05:30`);

    // Home team can edit until home deadline
    // Away team can edit until away deadline (if they submitted first in fixture_entry phase)
    if (isHomeTeam && now >= homeDeadline) {
      return NextResponse.json(
        { success: false, error: 'Home team deadline has passed. Cannot edit lineup.' },
        { status: 403 }
      );
    }

    if (isAwayTeam && now >= awayDeadline) {
      return NextResponse.json(
        { success: false, error: 'Away team deadline has passed. Cannot edit lineup.' },
        { status: 403 }
      );
    }

    // Get previous lineup for audit log
    const previousLineup = isHomeTeam ? fixture.home_lineup : fixture.away_lineup;

    // Check if matchups exist
    const existingMatchups = await sql`
      SELECT COUNT(*) as count FROM matchups WHERE fixture_id = ${fixtureId}
    `;
    const matchupsExist = existingMatchups[0].count > 0;

    let matchupsDeleted = false;

    // If matchups exist and delete_matchups is true, delete them
    if (matchupsExist && delete_matchups) {
      await sql`
        DELETE FROM matchups WHERE fixture_id = ${fixtureId}
      `;
      matchupsDeleted = true;
      console.log(`🗑️ Deleted matchups for fixture ${fixtureId} due to lineup edit`);
    } else if (matchupsExist && !delete_matchups) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Matchups already exist. Set delete_matchups=true to confirm deletion.',
          requires_confirmation: true
        },
        { status: 409 }
      );
    }

    // Update lineup
    const lineupData = {
      players: players,
      locked: false,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
    };

    if (isHomeTeam) {
      await sql`
        UPDATE fixtures
        SET 
          home_lineup = ${JSON.stringify(lineupData)}::jsonb,
          lineup_last_edited_by = ${userId},
          lineup_last_edited_at = NOW(),
          updated_at = NOW()
        WHERE id = ${fixtureId}
      `;
    } else {
      await sql`
        UPDATE fixtures
        SET 
          away_lineup = ${JSON.stringify(lineupData)}::jsonb,
          lineup_last_edited_by = ${userId},
          lineup_last_edited_at = NOW(),
          updated_at = NOW()
        WHERE id = ${fixtureId}
      `;
    }

    // Log the change
    await logLineupChange({
      fixtureId,
      teamId,
      action: 'updated',
      previousLineup,
      newLineup: lineupData,
      changedBy: userId,
      reason: matchupsDeleted ? 'Lineup edited - matchups deleted' : 'Lineup edited',
      matchupsDeleted
    });

    // Send notification if matchups were deleted
    if (matchupsDeleted) {
      try {
        const teamName = isHomeTeam ? fixture.home_team_name : fixture.away_team_name;
        await sendNotificationToSeason(
          {
            title: '🔄 Lineup Updated',
            body: `${teamName} has updated their lineup. Matchups have been reset.`,
            url: `/fixtures/${fixtureId}`,
            icon: '/logo.png',
            data: {
              type: 'lineup_updated',
              fixture_id: fixtureId,
              team_name: teamName,
              matchups_deleted: 'true'
            }
          },
          seasonId
        );
      } catch (notifError) {
        console.error('Failed to send lineup update notification:', notifError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Lineup updated successfully',
      matchups_deleted: matchupsDeleted
    });
  } catch (error: any) {
    console.error('Error updating lineup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update lineup' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const { fixtureId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const teamType = searchParams.get('team_type');

    // Get fixture from Neon (not Firebase)
    const sql = getTournamentDb();
    
    const fixtures = await sql`
      SELECT * FROM fixtures WHERE id = ${fixtureId} LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Fixture not found' },
        { status: 404 } 
      );
    }

    const fixture = fixtures[0];

    let isTripleThreat = String(fixture.tournament_id || '').toLowerCase().includes('triple_threat');
    if (!isTripleThreat && fixture.tournament_id) {
      const tourRows = await sql`
        SELECT t.tournament_type, ts.matchday_format
        FROM tournaments t
        LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
        WHERE t.id = ${fixture.tournament_id}
        LIMIT 1
      `;
      isTripleThreat =
        tourRows.length > 0 &&
        (tourRows[0].tournament_type === 'triple_threat' ||
          tourRows[0].matchday_format === 'triple_threat');
    }

    // If team_type is specified, return only that team's lineup from lineups table
    if (teamType) {
      if (teamType !== 'home' && teamType !== 'away') {
        return NextResponse.json(
          { success: false, error: 'team_type must be "home" or "away"' },
          { status: 400 }
        );
      }

      const teamId = teamType === 'home' ? fixture.home_team_id : fixture.away_team_id;

      // Query the lineups table
      const lineups = isTripleThreat
        ? await sql`
            SELECT * FROM lineups
            WHERE fixture_id = ${fixtureId}
              AND team_id = ${teamId}
              AND submitted_at IS NOT NULL
              AND COALESCE(submitted_by, '') <> 'system_auto'
              AND COALESCE(is_draft, false) = false
              AND triple_threat_lineup IS NOT NULL
            LIMIT 1
          `
        : await sql`
            SELECT * FROM lineups 
            WHERE fixture_id = ${fixtureId} 
            AND team_id = ${teamId}
            LIMIT 1
          `;

      console.log(`Lineup query for ${teamType} team (${teamId}):`, lineups);

      if (lineups.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No lineup submitted yet' },
          { status: 404 }
        );
      }

      const lineup = lineups[0];

      // Handle Triple Threat lineups cleanly (objects with player_id/mode + triple_threat_lineup JSON)
      if (isTripleThreat && lineup.triple_threat_lineup) {
        const extractId = (item: any): string => {
          if (!item) return '';
          if (typeof item === 'string') return item.trim();
          return String(item.player_id || item.id || '').trim();
        };

        const tt = lineup.triple_threat_lineup;
        const rawCoop = Array.isArray(tt.coop) ? tt.coop : [];
        const rawDuo = Array.isArray(tt.duo) ? tt.duo : [];
        const rawSingle = Array.isArray(tt.single) ? tt.single : tt.single ? [tt.single] : [];

        const allIds = Array.from(
          new Set([
            ...rawCoop.map(extractId),
            ...rawDuo.map(extractId),
            ...rawSingle.map(extractId),
          ].filter(Boolean))
        );

        const nameMap = new Map<string, string>();
        [...rawCoop, ...rawDuo, ...rawSingle].forEach((item: any) => {
          if (item && typeof item === 'object') {
            const id = extractId(item);
            const name = item.player_name || item.name;
            if (id && name) nameMap.set(id, name);
          }
        });

        if (allIds.length > 0) {
          let dbPlayers = await sql`
            SELECT player_id::text AS player_id, player_name
            FROM player_seasons
            WHERE player_id::text = ANY(${allIds})
              AND season_id = ${lineup.season_id}
          `;
          if (dbPlayers.length === 0) {
            dbPlayers = await sql`
              SELECT player_id::text AS player_id, player_name
              FROM realplayerstats
              WHERE player_id::text = ANY(${allIds})
                AND season_id = ${lineup.season_id}
            `;
          }
          dbPlayers.forEach((p: any) => {
            if (p.player_id && p.player_name) {
              nameMap.set(String(p.player_id), p.player_name);
            }
          });
        }

        const resolveSlot = (arr: any[]) =>
          arr.map((item: any) => {
            const id = extractId(item);
            return {
              player_id: id,
              player_name: nameMap.get(id) || 'Unknown Player',
            };
          });

        const resolvedTripleThreat = {
          coop: resolveSlot(rawCoop),
          duo: resolveSlot(rawDuo),
          single: resolveSlot(rawSingle),
        };

        const formattedLineup = [
          ...resolvedTripleThreat.coop.map((p, idx) => ({ ...p, position: idx + 1, mode: 'coop', is_substitute: false })),
          ...resolvedTripleThreat.duo.map((p, idx) => ({ ...p, position: idx + 3, mode: 'duo', is_substitute: false })),
          ...resolvedTripleThreat.single.map((p) => ({ ...p, position: 5, mode: 'single', is_substitute: false })),
        ];

        return NextResponse.json({
          success: true,
          is_triple_threat: true,
          triple_threat_lineup: resolvedTripleThreat,
          lineup: formattedLineup,
          locked: lineup.is_locked || false,
          submitted_at: lineup.submitted_at || lineup.created_at || null,
        });
      }

      // Standard lineup: handle both plain string IDs and legacy { player_id } objects
      const extractStdId = (item: any): string =>
        typeof item === 'string' ? item.trim() : String(item?.player_id || item?.id || '').trim();
      const rawStartingIds = (lineup.starting_xi || []).map(extractStdId).filter(Boolean);
      const rawSubIds = (lineup.substitutes || []).map(extractStdId).filter(Boolean);
      const playerIds = [...rawStartingIds, ...rawSubIds];

      if (playerIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No players in lineup' },
          { status: 404 }
        );
      }

      // Fetch player names from player_seasons with fallback to realplayerstats
      let players = await sql`
        SELECT player_id, player_name 
        FROM player_seasons 
        WHERE player_id = ANY(${playerIds})
        AND season_id = ${lineup.season_id}
      `;
      if (players.length === 0) {
        players = await sql`
          SELECT player_id, player_name 
          FROM realplayerstats 
          WHERE player_id = ANY(${playerIds})
          AND season_id = ${lineup.season_id}
        `;
      }

      // Create a map of player_id to player_name
      const playerMap = new Map<string, string>(
        players.map((p: any) => [String(p.player_id), String(p.player_name || 'Unknown Player')])
      );

      // Format the lineup with player names
      const formattedLineup: Array<{
        player_id: string;
        player_name: string;
        position: number;
        is_substitute: boolean;
      }> = [];
      
      // Add starting XI
      rawStartingIds.forEach((playerId: string, index: number) => {
        formattedLineup.push({
          player_id: playerId,
          player_name: playerMap.get(playerId) || 'Unknown Player',
          position: index + 1,
          is_substitute: false,
        });
      });

      // Add substitutes
      rawSubIds.forEach((playerId: string, index: number) => {
        formattedLineup.push({
          player_id: playerId,
          player_name: playerMap.get(playerId) || 'Unknown Player',
          position: rawStartingIds.length + index + 1,
          is_substitute: true,
        });
      });

      return NextResponse.json({
        success: true,
        lineup: formattedLineup,
        locked: lineup.is_locked || false,
        submitted_at: lineup.submitted_at || lineup.created_at || null,
      });
    }

    // Return both lineups from lineups table
    const homeLineups = await sql`
      SELECT * FROM lineups 
      WHERE fixture_id = ${fixtureId} 
      AND team_id = ${fixture.home_team_id}
      LIMIT 1
    `;

    const awayLineups = await sql`
      SELECT * FROM lineups 
      WHERE fixture_id = ${fixtureId} 
      AND team_id = ${fixture.away_team_id}
      LIMIT 1
    `;

    return NextResponse.json({
      success: true,
      data: {
        home_lineup: homeLineups.length > 0 ? homeLineups[0] : null,
        away_lineup: awayLineups.length > 0 ? awayLineups[0] : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching lineup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lineup' },
      { status: 500 }
    );
  }
}
