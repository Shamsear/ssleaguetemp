import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getMainDb } from '@/lib/neon/main-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';
import {
  buildGroupStageFixtures,
  buildLeagueFixtures,
  distributeTeamsIntoGroups,
  normalizeGroupCode,
  TournamentTeamInput,
} from '@/lib/tournament/group-stage';

// POST - Generate fixtures for a tournament
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { id: tournamentId } = await params;
    const body = await request.json();
    const { is_two_legged, matchup_mode = 'manual' } = body;

    // Get teams already assigned to this tournament from teamstats
    const assignedTeams = await sql`
      SELECT DISTINCT team_id, team_name
      FROM teamstats
      WHERE tournament_id = ${tournamentId}
      ORDER BY team_name ASC
    `;

    if (assignedTeams.length < 2) {
      return NextResponse.json(
        { success: false, error: 'At least 2 teams must be assigned to this tournament first. Please use the Teams tab to assign teams.' },
        { status: 400 }
      );
    }

    const team_ids = assignedTeams.map((t: any) => t.team_id);

    // Get tournament details with format settings
    const tournament = await sql`
      SELECT t.*, ts.tournament_system, ts.matchday_format, ts.clean_sweep_bonus, ts.points_as_gd
      FROM tournaments t
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE t.id = ${tournamentId}
      LIMIT 1
    `;

    if (tournament.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tournament not found' },
        { status: 404 }
      );
    }

    const tournamentData = tournament[0];

    // Validate tournament has at least one stage enabled
    if (!tournamentData.has_league_stage && !tournamentData.has_group_stage && !tournamentData.has_knockout_stage) {
      return NextResponse.json(
        { success: false, error: 'Tournament must have at least one stage enabled (League, Group, or Knockout)' },
        { status: 400 }
      );
    }

    // Check if fixtures already exist
    const existingFixtures = await sql`
      SELECT COUNT(*)::int as count
      FROM fixtures
      WHERE tournament_id = ${tournamentId}
    `;

    if (Number(existingFixtures[0]?.count || 0) > 0) {
      return NextResponse.json(
        { success: false, error: 'Fixtures already exist for this tournament. Delete them first.' },
        { status: 400 }
      );
    }

    // Get team details from Firebase
    const teamsData: TournamentTeamInput[] = [];
    for (const teamId of team_ids) {
      const teamDoc = await adminDb.collection('teams').doc(teamId).get();
      if (!teamDoc.exists) {
        return NextResponse.json(
          { success: false, error: `Team ${teamId} not found` },
          { status: 400 }
        );
      }
      const teamData = teamDoc.data();
      teamsData.push({
        id: teamId,
        team_name: teamData?.team_name || 'Unknown Team'
      });
    }

    // Sort teams by name for consistent fixture generation
    const teams = teamsData.sort((a: any, b: any) => a.team_name.localeCompare(b.team_name));

    // Generate fixtures based on tournament format
    let fixtures: any[] = [];

    if (tournamentData.has_league_stage) {
      // League format: Round-robin
      console.log('Generating league fixtures (round-robin)...');
      fixtures = buildLeagueFixtures(
        tournamentId,
        tournamentData.season_id,
        teams,
        is_two_legged ?? true,
        matchup_mode
      );
    } else if (tournamentData.has_group_stage) {
      // Group format: Always respect saved group assignments from `tournament_team_groups` if present,
      // even when `group_assignment_mode` is `'auto'` (e.g., distributed & saved via Groups tab).
      console.log('Generating group stage fixtures...');

      const groupAssignments = await sql`
        SELECT team_id, group_name
        FROM tournament_team_groups
        WHERE tournament_id = ${tournamentId}
      `;

      const participatingIds = new Set(teams.map((t) => t.id));
      const validAssignments = groupAssignments.filter(
        (a: any) => participatingIds.has(a.team_id) && normalizeGroupCode(a.group_name) !== ''
      );

      if (validAssignments.length > 0) {
        const teamGroupMap = new Map<string, string>(
          validAssignments.map((a: any) => [a.team_id, a.group_name])
        );

        teams.forEach((team) => {
          team.group = teamGroupMap.get(team.id) || null;
        });

        const unassignedTeams = teams.filter((t) => !t.group);
        if (unassignedTeams.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Some teams are not assigned to any group (${unassignedTeams.map((t) => t.team_name).join(', ')}). Please complete group assignments in the Groups tab.`,
            },
            { status: 400 }
          );
        }
      } else if (tournamentData.group_assignment_mode === 'manual') {
        return NextResponse.json(
          { success: false, error: 'Manual group assignment mode is enabled but no teams have been assigned to groups. Please assign teams to groups first.' },
          { status: 400 }
        );
      } else {
        // Auto mode with no pre-saved groups yet: distribute evenly and persist to tournament_team_groups
        const distributed = distributeTeamsIntoGroups(
          teams,
          tournamentData.number_of_groups || 4,
          { shuffle: true }
        );

        await sql`
          DELETE FROM tournament_team_groups
          WHERE tournament_id = ${tournamentId}
        `;

        for (const item of distributed) {
          item.team.group = item.groupLabel;
          await sql`
            INSERT INTO tournament_team_groups (tournament_id, team_id, group_name, created_at, updated_at)
            VALUES (${tournamentId}, ${item.team.id}, ${item.groupLabel}, NOW(), NOW())
          `;
        }
      }

      fixtures = buildGroupStageFixtures(
        tournamentId,
        tournamentData.season_id,
        teams,
        tournamentData.number_of_groups || 4,
        is_two_legged ?? true,
        {
          useAssignedGroups: true,
          matchupMode: matchup_mode,
        }
      );
    } else if (tournamentData.is_pure_knockout) {
      // Pure knockout: Generate bracket
      console.log('Generating knockout bracket...');
      fixtures = generateKnockoutFixtures(
        tournamentId,
        tournamentData.season_id,
        teams,
        tournamentData.playoff_teams || teams.length
      );
    }

    if (fixtures.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fixtures generated. Check tournament format settings.' },
        { status: 400 }
      );
    }

    const isTT = tournamentData.tournament_type === 'triple_threat' || tournamentData.matchday_format === 'triple_threat' || tournamentData.tournament_name?.toLowerCase().includes('triple threat');

    // Insert fixtures in batch
    for (const fixture of fixtures) {
      await sql`
        INSERT INTO fixtures (
          id,
          tournament_id,
          season_id,
          round_number,
          match_number,
          home_team_id,
          away_team_id,
          home_team_name,
          away_team_name,
          status,
          leg,
          matchup_mode,
          knockout_format,
          scoring_system,
          group_name,
          created_at,
          updated_at
        ) VALUES (
          ${fixture.id},
          ${fixture.tournament_id},
          ${fixture.season_id},
          ${fixture.round_number},
          ${fixture.match_number},
          ${fixture.home_team_id},
          ${fixture.away_team_id},
          ${fixture.home_team_name},
          ${fixture.away_team_name},
          ${fixture.status},
          ${fixture.leg},
          ${fixture.matchup_mode || 'manual'},
          ${isTT ? 'triple_threat' : (fixture.knockout_format || null)},
          ${isTT ? 'triple_threat' : (tournamentData.scoring_system || 'goals')},
          ${fixture.group_name || null},
          NOW(),
          NOW()
        )
      `;
    }

    // Create round_deadlines for each round
    const uniqueRounds = [...new Set(fixtures.map((f: any) => `${f.round_number}_${f.leg}`))];

    for (const roundKey of uniqueRounds) {
      const [roundNumber, leg] = roundKey.split('_');

      await sql`
        INSERT INTO round_deadlines (
          tournament_id,
          season_id,
          round_number,
          leg,
          round_start_time,
          away_fixture_deadline_time,
          result_entry_deadline_time,
          status,
          created_at,
          updated_at
        ) VALUES (
          ${tournamentId},
          ${tournamentData.season_id},
          ${parseInt(roundNumber)},
          ${leg},
          ${isTT ? '00:00' : '14:00'},
          ${isTT ? '14:00' : '17:00'},
          '00:30',
          'pending',
          NOW(),
          NOW()
        )
        ON CONFLICT (tournament_id, round_number, leg) DO NOTHING
      `;
    }

    // Teams are already assigned via the Teams tab, so no need to update here
    console.log(`✅ Generated fixtures for ${team_ids.length} teams in tournament ${tournamentId}`);

    // Send notification
    try {
      await sendNotificationToSeason(
        {
          title: `📅 ${tournamentData.tournament_name || tournamentData.name || 'Tournament'} Fixtures Generated`,
          body: `${fixtures.length} fixtures have been created. Check the schedule!`,
          url: `/dashboard/tournaments/${tournamentId}`,
          icon: '/logo.png',
          data: {
            type: 'tournament_fixtures_generated',
            tournament_id: tournamentId,
            fixtures_count: String(fixtures.length)
          }
        },
        tournamentData.season_id
      );
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }

    return NextResponse.json({
      success: true,
      fixtures_count: fixtures.length,
      message: `Generated ${fixtures.length} fixtures for tournament`,
    });
  } catch (error: any) {
    console.error('Error generating fixtures:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate fixtures' },
      { status: 500 }
    );
  }
}

// GET - Get fixtures for a tournament
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { id: tournamentId } = await params;

    const fixtures = await sql`
      SELECT *
      FROM fixtures
      WHERE tournament_id = ${tournamentId}
      ORDER BY round_number ASC, COALESCE(group_name, 'ZZZ') ASC, match_number ASC
    `;

    // Fetch team logos from Neon Main database (where teams and team_seasons reside)
    const logosMap: Record<string, string | null> = {};
    if (fixtures.length > 0) {
      try {
        const mainSql = getMainDb();
        const seasonId = fixtures[0].season_id;
        const tsRows = await mainSql`
          SELECT team_id, team_name, logo_url, raw_data
          FROM team_seasons
          WHERE season_id = ${seasonId}
        `;
        const tRows = await mainSql`
          SELECT id, team_id, team_name, logo_url, raw_data
          FROM teams
        `;

        tsRows.forEach((r: any) => {
          const logo = r.logo_url || r.raw_data?.logo_url || r.raw_data?.team_logo || r.raw_data?.logoUrl || null;
          if (logo) {
            if (r.team_id) logosMap[r.team_id] = logo;
            if (r.team_name) logosMap[r.team_name.toLowerCase()] = logo;
          }
        });

        tRows.forEach((r: any) => {
          const logo = r.logo_url || r.raw_data?.logo_url || r.raw_data?.team_logo || r.raw_data?.logoUrl || null;
          if (logo) {
            if (r.id && !logosMap[r.id]) logosMap[r.id] = logo;
            if (r.team_id && !logosMap[r.team_id]) logosMap[r.team_id] = logo;
            if (r.team_name && !logosMap[r.team_name.toLowerCase()]) logosMap[r.team_name.toLowerCase()] = logo;
          }
        });
      } catch (e) {
        console.error('Error fetching team logos from mainDb:', e);
      }

      // Fallback to adminDb if mainSql didn't populate logos
      if (Object.keys(logosMap).length === 0) {
        try {
          const teamDocs = await adminDb.collection('teams').get();
          teamDocs.docs.forEach((doc: any) => {
            const d = doc.data();
            const logo = d.logo_url || d.team_logo || d.logoUrl || d.logoURL || null;
            if (logo) {
              logosMap[doc.id] = logo;
              if (d.name) logosMap[d.name.toLowerCase()] = logo;
              if (d.team_name) logosMap[d.team_name.toLowerCase()] = logo;
            }
          });
        } catch (fbErr) {
          console.error('Error fetching team logos from adminDb fallback:', fbErr);
        }
      }
    }

    const fixturesWithLogos = fixtures.map((f: any) => ({
      ...f,
      group_name: f.group_name || f.id?.match(/_grp([A-Za-z0-9]+)_/)?.[1] || null,
      home_team_logo: logosMap[f.home_team_id] || (f.home_team_name ? logosMap[f.home_team_name.toLowerCase()] : null) || null,
      away_team_logo: logosMap[f.away_team_id] || (f.away_team_name ? logosMap[f.away_team_name.toLowerCase()] : null) || null,
    }));

    return NextResponse.json({ success: true, fixtures: fixturesWithLogos });
  } catch (error: any) {
    console.error('Error fetching fixtures:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fixtures' },
      { status: 500 }
    );
  }
}

// DELETE - Delete all fixtures for a tournament
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { id: tournamentId } = await params;

    // Delete round_deadlines first (foreign key constraint)
    await sql`
      DELETE FROM round_deadlines
      WHERE tournament_id = ${tournamentId}
    `;

    // Delete fixtures
    await sql`
      DELETE FROM fixtures
      WHERE tournament_id = ${tournamentId}
    `;

    return NextResponse.json({
      success: true,
      message: 'All fixtures deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting fixtures:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete fixtures' },
      { status: 500 }
    );
  }
}

// Helper function to generate knockout bracket fixtures
function generateKnockoutFixtures(
  tournamentId: string,
  seasonId: string,
  teams: any[],
  playoffTeams: number
) {
  const fixtures: any[] = [];

  // Ensure playoff teams is a power of 2 (2, 4, 8, 16...)
  const validSizes = [2, 4, 8, 16, 32];
  const actualPlayoffTeams = validSizes.find((size: any) => size >= Math.min(playoffTeams, teams.length)) || 2;

  // Take only the number of teams that fit the bracket
  const bracketTeams = teams.slice(0, actualPlayoffTeams);

  if (bracketTeams.length < 2) {
    return fixtures;
  }

  // Determine tournament structure
  const rounds: { [key: string]: string } = {
    '2': 'Final',
    '4': 'Semi-Final',
    '8': 'Quarter-Final',
    '16': 'Round of 16',
    '32': 'Round of 32',
  };

  let currentRound = 1;
  let teamsInRound = bracketTeams.length;

  // Generate fixtures for each knockout round
  while (teamsInRound >= 2) {
    const roundName = rounds[teamsInRound.toString()] || `Round ${currentRound}`;
    const matchesInRound = teamsInRound / 2;

    for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
      const fixtureId = `${tournamentId}_ko_r${currentRound}_m${matchNum}`;

      // For the first round, assign actual teams. For later rounds, use TBD
      if (currentRound === 1) {
        const homeIdx = (matchNum - 1) * 2;
        const awayIdx = homeIdx + 1;

        fixtures.push({
          id: fixtureId,
          tournament_id: tournamentId,
          season_id: seasonId,
          round_number: currentRound,
          match_number: matchNum,
          home_team_id: bracketTeams[homeIdx].id,
          away_team_id: bracketTeams[awayIdx].id,
          home_team_name: bracketTeams[homeIdx].team_name,
          away_team_name: bracketTeams[awayIdx].team_name,
          status: 'scheduled',
          leg: 'knockout',
          knockout_round: roundName,
        });
      } else {
        // TBD teams for future rounds
        fixtures.push({
          id: fixtureId,
          tournament_id: tournamentId,
          season_id: seasonId,
          round_number: currentRound,
          match_number: matchNum,
          home_team_id: 'TBD',
          away_team_id: 'TBD',
          home_team_name: `Winner R${currentRound - 1}M${(matchNum - 1) * 2 + 1}`,
          away_team_name: `Winner R${currentRound - 1}M${(matchNum - 1) * 2 + 2}`,
          status: 'pending',
          leg: 'knockout',
          knockout_round: roundName,
        });
      }
    }

    teamsInRound = teamsInRound / 2;
    currentRound++;
  }

  return fixtures;
}
