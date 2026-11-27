import { getTournamentDb } from '@/lib/neon/tournament-config';
import {
  computeAwayLineupDeadline,
  validateTripleThreatLineup,
  TripleThreatLineupSubmission,
} from '@/lib/tournament/triple-threat-engine';

export interface LineupValidationResult {
  isValid: boolean;
  errors: string[];
  classicPlayerCount: number;
}

export interface LineupData {
  starting_xi: string[];
  substitutes: string[];
  triple_threat_lineup?: TripleThreatLineupSubmission;
}

async function getTeamSeasonRosterTable(
  sql: ReturnType<typeof getTournamentDb>,
  seasonId: string,
  teamId: string
): Promise<'player_seasons' | 'realplayerstats'> {
  const psCheck = await sql`
    SELECT 1 FROM player_seasons
    WHERE season_id = ${seasonId} AND team_id = ${teamId}
    LIMIT 1
  `;
  return psCheck.length > 0 ? 'player_seasons' : 'realplayerstats';
}

async function fetchRegisteredTeamPlayers(
  sql: ReturnType<typeof getTournamentDb>,
  playerIds: string[],
  seasonId: string,
  teamId: string
) {
  if (playerIds.length === 0) return [];
  const table = await getTeamSeasonRosterTable(sql, seasonId, teamId);
  if (table === 'player_seasons') {
    return await sql`
      SELECT player_id, category
      FROM player_seasons
      WHERE player_id = ANY(${playerIds})
      AND season_id = ${seasonId}
      AND team_id = ${teamId}
    `;
  }
  return await sql`
    SELECT player_id, category
    FROM realplayerstats
    WHERE player_id = ANY(${playerIds})
    AND season_id = ${seasonId}
    AND team_id = ${teamId}
  `;
}

/**
 * Validate lineup meets all requirements
 */
export async function validateLineup(
  lineup: LineupData,
  seasonId: string,
  teamId: string,
  tournamentId?: string
): Promise<LineupValidationResult> {
  const errors: string[] = [];
  const sql = getTournamentDb();

  console.log('🔍 validateLineup - Input:', {
    starting_xi_count: lineup.starting_xi?.length,
    substitutes_count: lineup.substitutes?.length,
    starting_xi: lineup.starting_xi,
    substitutes: lineup.substitutes,
    seasonId,
    teamId
  });

  // Check if this is a Triple Threat tournament
  if (tournamentId) {
    try {
      const tourCheck = await sql`
        SELECT t.tournament_type, ts.matchday_format
        FROM tournaments t
        LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
        WHERE t.id = ${tournamentId}
        LIMIT 1
      `;
      const isTripleThreat = tourCheck.length > 0 && (
        tourCheck[0].tournament_type === 'triple_threat' || 
        tourCheck[0].matchday_format === 'triple_threat'
      );

      if (isTripleThreat) {
        let ttLineup = lineup.triple_threat_lineup;
        if (!ttLineup && Array.isArray(lineup.starting_xi)) {
          const coop = lineup.starting_xi.filter((p: any) => p && typeof p === 'object' && p.mode === 'coop').map((p: any) => String(p.player_id || p.id));
          const duo = lineup.starting_xi.filter((p: any) => p && typeof p === 'object' && p.mode === 'duo').map((p: any) => String(p.player_id || p.id));
          const single = lineup.starting_xi.filter((p: any) => p && typeof p === 'object' && p.mode === 'single').map((p: any) => String(p.player_id || p.id));
          if (coop.length === 2 && duo.length === 2 && single.length === 1) {
            ttLineup = { coop, duo, single };
          }
        }

        if (!ttLineup) {
          return {
            isValid: false,
            errors: ['Triple Threat tournament requires selecting 2 players for Co-op, 2 for Duo, and 1 for Single match.'],
            classicPlayerCount: 0
          };
        }

        const ttValidation = validateTripleThreatLineup(ttLineup);
        if (!ttValidation.valid) {
          return {
            isValid: false,
            errors: [ttValidation.error || 'Invalid Triple Threat lineup'],
            classicPlayerCount: 0
          };
        }

        const extractId = (item: any): string => {
          if (!item) return '';
          if (typeof item === 'string') return item.trim();
          return String(item.player_id || item.id || '').trim();
        };

        const allTtPlayers = [...ttLineup.coop, ...ttLineup.duo, ...ttLineup.single].map(extractId).filter(Boolean);
        const playerChecks = await fetchRegisteredTeamPlayers(sql, allTtPlayers, seasonId, teamId);

        if (playerChecks.length !== allTtPlayers.length) {
          const foundIds = new Set(playerChecks.map((p: any) => String(p.player_id)));
          const missing = allTtPlayers.filter((p) => !foundIds.has(String(p)));
          return {
            isValid: false,
            errors: [`Some selected players are not registered to your squad: ${missing.join(', ')}`],
            classicPlayerCount: 0
          };
        }

        return {
          isValid: true,
          errors: [],
          classicPlayerCount: 0
        };
      }
    } catch (ttErr) {
      console.error('Error checking tournament format for lineup:', ttErr);
    }
  }

  // 1. Check starting XI count
  if (!lineup.starting_xi || lineup.starting_xi.length !== 5) {
    const error = 'Starting XI must have exactly 5 players';
    console.error('❌', error, '- Got:', lineup.starting_xi?.length);
    errors.push(error);
  }

  // 2. Check substitutes count (0 to 2 allowed)
  if (lineup.substitutes && lineup.substitutes.length > 2) {
    const error = 'Cannot have more than 2 substitute players';
    console.error('❌', error, '- Got:', lineup.substitutes?.length);
    errors.push(error);
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      classicPlayerCount: 0,
    };
  }

  // 3. Check for duplicate players
  const allPlayers = [...lineup.starting_xi, ...lineup.substitutes];
  const uniquePlayers = new Set(allPlayers);
  
  if (uniquePlayers.size !== allPlayers.length) {
    errors.push('Duplicate players found in lineup');
  }

  // 4. Check if all players belong to the team and are registered for season
  console.log('🔍 Checking player eligibility:', { allPlayers, seasonId, teamId });
  const playerChecks = await fetchRegisteredTeamPlayers(sql, allPlayers, seasonId, teamId);
  console.log('🔍 Player checks result:', playerChecks);
  console.log('🔍 Unique category values found:', [...new Set(playerChecks.map((p: any) => p.category))]);

  if (playerChecks.length !== allPlayers.length) {
    const error = 'Some players are not eligible for this team/season';
    console.error('❌', error, '- Expected:', allPlayers.length, 'Found:', playerChecks.length);
    console.error('Missing players:', allPlayers.filter(p => !playerChecks.find((pc: any) => pc.player_id === p)));
    errors.push(error);
  }

  // 5. Validate category requirements from tournament settings
  const startingXIChecks = playerChecks.filter(
    (p: any) => lineup.starting_xi.includes(p.player_id)
  );
  
  console.log('🔍 Starting XI player categories:', {
    total_players_checked: playerChecks.length,
    starting_xi_players: startingXIChecks.length,
    starting_xi_categories: startingXIChecks.map((p: any) => ({ id: p.player_id, category: p.category }))
  });

  // Get category counts
  // Map category names to category IDs for validation
  const categoryNameToId: Record<string, string> = {
    'Classic': 'cat_classic',
    'Legend': 'cat_legend',
    'Rising Star': 'cat_rising_star',
    'Veteran': 'cat_veteran'
  };
  
  const categoryCounts: Record<string, number> = {};
  startingXIChecks.forEach((p: any) => {
    const categoryName = p.category || 'Unknown';
    // Try to get the category ID from the mapping, otherwise use the value as-is
    const categoryId = categoryNameToId[categoryName] || categoryName;
    categoryCounts[categoryId] = (categoryCounts[categoryId] || 0) + 1;
  });

  console.log('🔍 Category counts in starting XI:', categoryCounts);

  // 6. Check tournament settings for category requirements
  if (tournamentId) {
    try {
      const settingsResult = await sql`
        SELECT enable_category_requirements, lineup_category_requirements
        FROM tournament_settings
        WHERE tournament_id = ${tournamentId}
        LIMIT 1
      `;

      if (settingsResult.length > 0) {
        const enableRequirements = settingsResult[0].enable_category_requirements;
        const categoryRequirements = settingsResult[0].lineup_category_requirements;
        
        console.log('🔍 Tournament category settings:', {
          enable_category_requirements: enableRequirements,
          categoryRequirements
        });

        // Only validate if category requirements are enabled
        if (enableRequirements && categoryRequirements && Object.keys(categoryRequirements).length > 0) {
          console.log('🔍 Category requirements ENABLED - validating...');
          
          // Validate each category requirement
          for (const [categoryId, minCountRaw] of Object.entries(categoryRequirements)) {
            const minCount = Number(minCountRaw);
            const actualCount = categoryCounts[categoryId] || 0;
            console.log(`🔍 Checking category requirement:`, {
              categoryId,
              minCount,
              actualCount,
              categoryCounts,
              hasCategory: categoryId in categoryCounts
            });
            if (actualCount < minCount) {
              errors.push(`Starting XI must have at least ${minCount} player(s) from ${categoryId} category (currently has ${actualCount})`);
            }
          }
        } else {
          console.log('✅ Category requirements DISABLED - skipping validation');
        }
      }
    } catch (error) {
      console.error('Error checking tournament category requirements:', error);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    classicPlayerCount: categoryCounts['Classic'] || categoryCounts['classic'] || 0,
  };
}

/**
 * Check if lineup can still be edited (deadline not passed)
 * Updated to support:
 * 1. Home team can edit until home deadline
 * 2. Both teams can edit during fixture_entry phase (after home deadline, before away deadline, if no matchups)
 */
export async function isLineupEditable(
  fixtureId: string,
  teamId?: string
): Promise<{ editable: boolean; reason?: string; deadline?: string; roundStart?: string; homeDeadline?: string; awayDeadline?: string }> {
  const sql = getTournamentDb();

  // Get fixture and round deadline info
  const result = await sql`
    SELECT 
      f.round_number,
      f.season_id,
      f.tournament_id,
      f.leg,
      f.home_team_id,
      f.away_team_id,
      f.lineup_deadline,
      f.status as fixture_status,
      t.tournament_type,
      ts.matchday_format,
      rd.scheduled_date,
      rd.scheduled_date::text as scheduled_date_str,
      rd.round_start_time,
      rd.home_fixture_deadline_time,
      rd.away_fixture_deadline_time,
      rd.status as round_status
    FROM fixtures f
    LEFT JOIN tournaments t ON f.tournament_id = t.id
    LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
    LEFT JOIN round_deadlines rd ON 
      f.round_number = rd.round_number 
      AND f.season_id = rd.season_id
      AND f.tournament_id = rd.tournament_id
      AND (f.leg IS NULL OR rd.leg IS NULL OR f.leg = rd.leg)
    WHERE f.id = ${fixtureId}
    LIMIT 1
  `;

  if (result.length === 0) {
    return { editable: false, reason: 'Fixture not found' };
  }

  const fixture = result[0];

  // Don't block based on fixture_status alone - check actual deadlines
  // Only block if fixture is actually completed/finalized
  if (fixture.fixture_status && (fixture.fixture_status === 'completed' || fixture.fixture_status === 'finalized')) {
    return { 
      editable: false, 
      reason: 'Lineup locked - fixture has been completed'
    };
  }

  // Check if round has started and calculate deadlines
  if (fixture.scheduled_date || fixture.scheduled_date_str) {
    const now = new Date();
    const isTT =
      fixture.tournament_type === 'triple_threat' ||
      fixture.matchday_format === 'triple_threat' ||
      String(fixture.tournament_id || '').toLowerCase().includes('triple_threat');

    // Always resolve scheduled_date as IST YYYY-MM-DD (prefer exact SQL ::text cast)
    let scheduledDateStr = fixture.scheduled_date_str ? String(fixture.scheduled_date_str).split('T')[0] : '';
    if (!scheduledDateStr && fixture.scheduled_date instanceof Date) {
      const ist = new Date(fixture.scheduled_date.getTime() + 5.5 * 60 * 60 * 1000);
      scheduledDateStr = ist.toISOString().split('T')[0];
    } else if (!scheduledDateStr) {
      scheduledDateStr = String(fixture.scheduled_date).split('T')[0];
    }

    // Use the same time parsing as fixture page (IST +05:30)
    const homeTime = fixture.home_fixture_deadline_time || '17:00';
    const awayTime = fixture.away_fixture_deadline_time || '19:00';
    const homeDeadline = new Date(`${scheduledDateStr}T${homeTime}:00+05:30`);
    const awayDeadline = new Date(`${scheduledDateStr}T${awayTime}:00+05:30`);
    const awayLineupDeadline =
      computeAwayLineupDeadline({
        scheduled_date: fixture.scheduled_date,
        scheduled_date_str: scheduledDateStr,
        round_start_time: fixture.round_start_time,
        home_fixture_deadline_time: fixture.home_fixture_deadline_time,
        lineup_deadline: fixture.lineup_deadline,
        isTripleThreat: isTT,
      }) || new Date(`${scheduledDateStr}T${isTT ? '09:00' : '17:00'}:00+05:30`);

    // Round start time (used as Away lineup submission deadline)
    const roundStartTimeStr =
      fixture.round_start_time && /^\d{2}:\d{2}$/.test(fixture.round_start_time)
        ? fixture.round_start_time
        : fixture.home_fixture_deadline_time || (isTT ? '09:00' : '17:00');
    const roundStart = new Date(`${scheduledDateStr}T${roundStartTimeStr}:00+05:30`);
    
    // Check if matchups exist
    const matchupsResult = await sql`
      SELECT COUNT(*) as count
      FROM matchups
      WHERE fixture_id = ${fixtureId}
    `;
    const matchupsExist = matchupsResult[0].count > 0;
    
    // Determine if user is home team
    const isHomeTeam = teamId === fixture.home_team_id;

    // Special Rules for Triple Threat:
    // 1. Home team has Home Advantage: they can view the away team's lineup and adjust/change their own lineup anytime before matches are completed.
    // 2. Away team must submit their lineup before the round start time (round_start_time).
    if (isTT) {
      if (isHomeTeam && fixture.fixture_status !== 'completed' && fixture.fixture_status !== 'finalized') {
        return {
          editable: true,
          reason: 'Home team has Home Advantage and can view and adjust their lineup against the away team',
          deadline: awayLineupDeadline.toISOString(),
          roundStart: roundStart.toISOString(),
          homeDeadline: homeDeadline.toISOString(),
          awayDeadline: awayDeadline.toISOString()
        };
      }
      if (!isHomeTeam) {
        const isBeforeAwayDeadline = now < awayLineupDeadline;
        return {
          editable: isBeforeAwayDeadline,
          reason: isBeforeAwayDeadline 
            ? `Away team can edit lineup before ${roundStartTimeStr} IST` 
            : `Away team lineup submission deadline (${roundStartTimeStr} IST) has passed`,
          deadline: awayLineupDeadline.toISOString(),
          roundStart: roundStart.toISOString(),
          homeDeadline: homeDeadline.toISOString(),
          awayDeadline: awayDeadline.toISOString()
        };
      }
    }
    
    // Determine current phase based on round status and deadlines
    let currentPhase: 'draft' | 'home_fixture' | 'fixture_entry' | 'result_entry' | 'closed' = 'closed';
    
    // If round_status is null or undefined, determine phase by deadlines only
    if (!fixture.round_status || fixture.round_status === 'pending' || fixture.round_status === 'scheduled') {
      // Round hasn't started yet OR no status set - check if we're before the first deadline
      if (now < homeDeadline) {
        currentPhase = 'draft';
      } else {
        // If we're past home deadline but round status is still pending, treat as draft
        currentPhase = 'draft';
      }
    } else if (fixture.round_status === 'in_progress' || fixture.round_status === 'started' || fixture.round_status === 'active') {
      if (now < homeDeadline) {
        currentPhase = 'home_fixture';
      } else if (now < awayDeadline) {
        currentPhase = 'fixture_entry';
      } else {
        currentPhase = 'result_entry';
      }
    } else if (fixture.round_status === 'completed' || fixture.round_status === 'finalized') {
      currentPhase = 'closed';
    } else {
      // Unknown status - determine by deadlines
      if (now < homeDeadline) {
        currentPhase = 'draft';
      } else if (now < awayDeadline) {
        currentPhase = 'fixture_entry';
      } else {
        currentPhase = 'result_entry';
      }
    }
    
    console.log('🕐 Lineup Editability Check:', {
      fixtureId,
      teamId,
      isHomeTeam,
      matchupsExist,
      currentPhase,
      round_status: fixture.round_status,
      now: now.toISOString(),
      homeDeadline: homeDeadline.toISOString(),
      awayDeadline: awayDeadline.toISOString(),
      roundStart: roundStart.toISOString()
    });
    
    // Determine editability based on phase and matchups (same logic as fixture page)
    let editable = false;
    let reason = '';
    let deadline = roundStart.toISOString();
    
    if (currentPhase === 'draft') {
      // Draft mode - can always edit
      editable = true;
      reason = 'Round not started yet - draft mode';
      deadline = homeDeadline.toISOString();
    } else if (matchupsExist) {
      // Matchups exist - only home team can edit before home deadline
      if (isHomeTeam && now < homeDeadline) {
        editable = true;
        reason = 'Home team can edit until home deadline (will delete matchups)';
        deadline = homeDeadline.toISOString();
      } else {
        editable = false;
        reason = 'Lineup locked - matchups have been created';
      }
    } else {
      // No matchups yet - check phase
      if (now < homeDeadline) {
        // Before home deadline - anyone can edit
        editable = true;
        reason = 'Before home deadline';
        deadline = homeDeadline.toISOString();
      } else if (now < awayDeadline) {
        // After home deadline, before away deadline - both teams can edit
        editable = true;
        reason = 'Fixture entry phase - both teams can edit';
        deadline = awayDeadline.toISOString();
      } else {
        // After away deadline
        editable = false;
        reason = 'Lineup deadline has passed';
      }
    }
    
    console.log('🔒 Editability Result:', {
      editable,
      reason,
      deadline,
      currentPhase
    });

    return { 
      editable,
      reason,
      deadline,
      roundStart: roundStart.toISOString(),
      homeDeadline: homeDeadline.toISOString(),
      awayDeadline: awayDeadline.toISOString()
    };
  }

  return { editable: true, reason: 'Round not scheduled yet' };
}

/**
 * Check if a team has submitted lineup for a fixture
 */
export async function hasSubmittedLineup(
  fixtureId: string,
  teamId: string
): Promise<boolean> {
  const sql = getTournamentDb();

  const result = await sql`
    SELECT id 
    FROM lineups
    WHERE fixture_id = ${fixtureId}
    AND team_id = ${teamId}
    AND COALESCE(is_draft, false) = false
    AND jsonb_array_length(COALESCE(starting_xi, '[]'::jsonb)) >= 5
    LIMIT 1
  `;

  return result.length > 0;
}

export interface StandardLineupFixtureInput {
  fixture_id: string;
  season_id: string;
  tournament_id?: string | null;
  round_number?: number | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  tournament_type?: string | null;
  matchday_format?: string | null;
  matchup_mode?: string | null;
}

/**
 * Batch auto-populate lineups for standard (non-Triple Threat, non-blind_lineup)
 * fixtures whenever a team has an exact 5-player active squad (min/max = 5)
 * and no valid lineup (or an empty system_auto stub) exists yet.
 */
export async function autoPopulateStandardFivePlayerLineups(
  sql: ReturnType<typeof getTournamentDb>,
  fixtures: StandardLineupFixtureInput[]
): Promise<number> {
  const eligibleFixtures = fixtures.filter((f) => {
    const isTT =
      f.tournament_type === 'triple_threat' ||
      f.matchday_format === 'triple_threat' ||
      String(f.tournament_id || '').toLowerCase().includes('triple_threat');
    if (isTT) return false;
    if (f.matchup_mode === 'blind_lineup') return false;
    return Boolean(f.fixture_id && f.season_id);
  });

  if (eligibleFixtures.length === 0) return 0;

  const fixtureIds = Array.from(new Set(eligibleFixtures.map((f) => f.fixture_id)));
  const existingRows = await sql`
    SELECT fixture_id, team_id, starting_xi, submitted_by, is_draft
    FROM lineups
    WHERE fixture_id = ANY(${fixtureIds})
  `;

  const existingMap = new Map<string, any>();
  existingRows.forEach((row: any) => {
    existingMap.set(`${row.fixture_id}::${row.team_id}`, row);
  });

  const pendingSlots: Array<{
    fixture: StandardLineupFixtureInput;
    teamId: string;
    side: 'home' | 'away';
  }> = [];

  const isInvalidTeamId = (id?: string | null) =>
    !id || id === 'TBD' || id === 'bye';

  for (const fix of eligibleFixtures) {
    const candidates: Array<{ teamId?: string | null; side: 'home' | 'away' }> = [
      { teamId: fix.home_team_id, side: 'home' },
      { teamId: fix.away_team_id, side: 'away' },
    ];

    for (const c of candidates) {
      if (isInvalidTeamId(c.teamId)) continue;
      const tid = String(c.teamId);
      const existing = existingMap.get(`${fix.fixture_id}::${tid}`);
      const hasPlayers =
        existing &&
        Array.isArray(existing.starting_xi) &&
        existing.starting_xi.length > 0;
      const isEmptySystemAutoStub =
        existing &&
        existing.submitted_by === 'system_auto' &&
        (!Array.isArray(existing.starting_xi) || existing.starting_xi.length === 0);

      if (!existing || isEmptySystemAutoStub) {
        pendingSlots.push({ fixture: fix, teamId: tid, side: c.side });
      } else if (!hasPlayers && !existing.is_draft) {
        // Real row exists without players - leave untouched
      }
    }
  }

  if (pendingSlots.length === 0) return 0;

  // Group roster lookups by season_id so we only issue 2 SQL queries per season
  const teamIdsBySeason = new Map<string, Set<string>>();
  for (const slot of pendingSlots) {
    if (!teamIdsBySeason.has(slot.fixture.season_id)) {
      teamIdsBySeason.set(slot.fixture.season_id, new Set());
    }
    teamIdsBySeason.get(slot.fixture.season_id)!.add(slot.teamId);
  }

  const playersBySeasonTeam = new Map<string, string[]>();

  for (const [seasonId, teamSet] of teamIdsBySeason.entries()) {
    const teamIds = Array.from(teamSet);
    const psRows = await sql`
      SELECT team_id, player_id
      FROM player_seasons
      WHERE season_id = ${seasonId}
        AND team_id = ANY(${teamIds})
        AND registration_status = 'active'
      ORDER BY player_name ASC
    `;

    const psFoundTeams = new Set<string>();
    psRows.forEach((r: any) => {
      const tid = String(r.team_id);
      psFoundTeams.add(tid);
      const key = `${seasonId}::${tid}`;
      if (!playersBySeasonTeam.has(key)) playersBySeasonTeam.set(key, []);
      playersBySeasonTeam.get(key)!.push(String(r.player_id));
    });

    const missingTeams = teamIds.filter((tid) => !psFoundTeams.has(tid));
    if (missingTeams.length > 0) {
      const rpsRows = await sql`
        SELECT team_id, player_id
        FROM realplayerstats
        WHERE season_id = ${seasonId}
          AND team_id = ANY(${missingTeams})
        ORDER BY player_name ASC
      `;
      rpsRows.forEach((r: any) => {
        const tid = String(r.team_id);
        const key = `${seasonId}::${tid}`;
        if (!playersBySeasonTeam.has(key)) playersBySeasonTeam.set(key, []);
        playersBySeasonTeam.get(key)!.push(String(r.player_id));
      });
    }
  }

  let populatedCount = 0;

  for (const slot of pendingSlots) {
    const { fixture, teamId } = slot;
    const playerIds = playersBySeasonTeam.get(`${fixture.season_id}::${teamId}`) || [];
    if (playerIds.length !== 5) continue;

    const lineupId = generateLineupId(fixture.fixture_id, teamId);
    const jsonStartingXI = JSON.stringify(playerIds);

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
        classic_player_count,
        is_valid,
        validation_errors,
        is_draft,
        submitted_by,
        submitted_at,
        created_at,
        updated_at
      ) VALUES (
        ${lineupId},
        ${fixture.fixture_id},
        ${teamId},
        ${fixture.round_number ?? 1},
        ${fixture.season_id},
        ${fixture.tournament_id || null},
        ${jsonStartingXI}::jsonb,
        '[]'::jsonb,
        0,
        true,
        '[]'::jsonb,
        false,
        'system_auto',
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        starting_xi = EXCLUDED.starting_xi,
        substitutes = '[]'::jsonb,
        is_valid = true,
        validation_errors = '[]'::jsonb,
        is_draft = false,
        submitted_at = COALESCE(lineups.submitted_at, NOW()),
        updated_at = NOW()
      WHERE lineups.submitted_by = 'system_auto'
        AND (lineups.starting_xi IS NULL OR jsonb_array_length(lineups.starting_xi) = 0)
    `;

    try {
      if (slot.side === 'home') {
        await sql`
          UPDATE fixtures
          SET home_lineup_submitted = true,
              home_lineup_submitted_at = COALESCE(home_lineup_submitted_at, NOW())
          WHERE id = ${fixture.fixture_id}
        `;
      } else {
        await sql`
          UPDATE fixtures
          SET away_lineup_submitted = true,
              away_lineup_submitted_at = COALESCE(away_lineup_submitted_at, NOW())
          WHERE id = ${fixture.fixture_id}
        `;
      }
    } catch {
      // Non-critical if flag update is skipped
    }

    populatedCount++;
  }

  return populatedCount;
}

/**
 * Get lineup status for a fixture (both teams)
 */
export async function getFixtureLineupStatus(fixtureId: string) {
  const sql = getTournamentDb();

  const fixture = await sql`
    SELECT 
      id,
      home_team_id,
      away_team_id,
      home_team_name,
      away_team_name,
      round_number,
      season_id
    FROM fixtures
    WHERE id = ${fixtureId}
    LIMIT 1
  `;

  if (fixture.length === 0) {
    return null;
  }

  const fix = fixture[0];

  // Check both team lineups
  const lineups = await sql`
    SELECT 
      team_id,
      is_valid,
      is_locked,
      warning_given,
      selected_by_opponent,
      submitted_at,
      classic_player_count
    FROM lineups
    WHERE fixture_id = ${fixtureId}
    AND team_id IN (${fix.home_team_id}, ${fix.away_team_id})
  `;

  const homeLineup = lineups.find((l: any) => l.team_id === fix.home_team_id);
  const awayLineup = lineups.find((l: any) => l.team_id === fix.away_team_id);

  return {
    fixture: fix,
    homeTeam: {
      id: fix.home_team_id,
      name: fix.home_team_name,
      hasLineup: !!homeLineup,
      lineupStatus: homeLineup || null,
    },
    awayTeam: {
      id: fix.away_team_id,
      name: fix.away_team_name,
      hasLineup: !!awayLineup,
      lineupStatus: awayLineup || null,
    },
  };
}

/**
 * Validate substitution
 */
export async function validateSubstitution(
  lineupId: string,
  playerOut: string,
  playerIn: string
): Promise<{ valid: boolean; error?: string }> {
  const sql = getTournamentDb();

  // Get lineup
  const lineup = await sql`
    SELECT 
      starting_xi,
      substitutes,
      is_locked
    FROM lineups
    WHERE id = ${lineupId}
    LIMIT 1
  `;

  if (lineup.length === 0) {
    return { valid: false, error: 'Lineup not found' };
  }

  const lineupData = lineup[0];
  const startingXI = lineupData.starting_xi as string[];
  const subs = lineupData.substitutes as string[];

  // Check if player_out is in starting XI
  if (!startingXI.includes(playerOut)) {
    return { valid: false, error: 'Player to substitute out is not in starting XI' };
  }

  // Check if player_in is in substitutes
  if (!subs.includes(playerIn)) {
    return { valid: false, error: 'Player to substitute in is not in substitutes' };
  }

  return { valid: true };
}

/**
 * Generate lineup ID
 */
export function generateLineupId(fixtureId: string, teamId: string): string {
  return `lineup_${fixtureId}_${teamId}`;
}
