import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * Generate a single knockout round with custom settings
 * Allows different formats/scoring for each round (quarters, semis, finals)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { id: tournamentId } = await params;
    const body = await request.json();

    const {
      knockout_round, // 'quarter_finals', 'semi_finals', 'finals', 'third_place'
      round_number,
      num_teams,
      knockout_format = 'single_leg', // 'single_leg', 'two_leg', 'round_robin'
      scoring_system = 'goals', // 'goals', 'wins'
      matchup_mode = 'manual', // 'manual', 'blind_lineup'
      teams = [], // Array of { team_id, team_name, seed }
      pairing_method = 'standard', // 'standard', 'manual', 'random'
      start_date,
      created_by,
      created_by_name,
    } = body;

    // Validation
    if (!knockout_round || !round_number || !num_teams) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: knockout_round, round_number, num_teams' },
        { status: 400 }
      );
    }

    if (teams.length !== num_teams) {
      return NextResponse.json(
        { success: false, error: `Expected ${num_teams} teams, got ${teams.length}` },
        { status: 400 }
      );
    }

    // Verify tournament exists
    const tournaments = await sql`
      SELECT id, season_id, tournament_name, tournament_type, matchday_format
      FROM tournaments
      WHERE id = ${tournamentId}
    `;

    if (tournaments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tournament not found' },
        { status: 404 }
      );
    }

    const tournament = tournaments[0];

    // Create pairings based on method
    let pairings: Array<{ home: any; away: any }> = [];

    if (pairing_method === 'standard') {
      // Standard seeding: 1 vs last, 2 vs second-last, etc.
      const sortedTeams = [...teams].sort((a, b) => (a.seed || 0) - (b.seed || 0));
      const numMatches = num_teams / 2;

      for (let i = 0; i < numMatches; i++) {
        pairings.push({
          home: sortedTeams[i],
          away: sortedTeams[num_teams - 1 - i],
        });
      }
    } else if (pairing_method === 'manual') {
      // Teams array should already be in pairs
      for (let i = 0; i < teams.length; i += 2) {
        pairings.push({
          home: teams[i],
          away: teams[i + 1],
        });
      }
    } else if (pairing_method === 'random') {
      // Random draw
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i += 2) {
        pairings.push({
          home: shuffled[i],
          away: shuffled[i + 1],
        });
      }
    }

    // Check if tournament is Triple Threat or Triple Threat format requested
    const isTT = tournament.tournament_type === 'triple_threat' || tournament.matchday_format === 'triple_threat' || knockout_format === 'triple_threat' || tournament.tournament_name?.toLowerCase().includes('triple threat');
    const effectiveFormat = (knockout_format === 'triple_threat' || (isTT && knockout_format === 'single_leg'))
      ? 'triple_threat'
      : knockout_format;
    const effectiveScoring = scoring_system === 'triple_threat' || isTT
      ? 'triple_threat'
      : scoring_system;

    // Generate fixtures based on knockout format
    const fixturesToCreate: any[] = [];

    if (effectiveFormat === 'triple_threat') {
      // Triple Threat single leg fixture (3 matchups: Co-op 2v2, Duo 2v2, Single 1v1)
      pairings.forEach((pair, idx) => {
        fixturesToCreate.push({
          tournament_id: tournamentId,
          season_id: tournament.season_id,
          round_number,
          match_number: idx + 1,
          home_team_id: pair.home.team_id,
          home_team_name: pair.home.team_name,
          away_team_id: pair.away.team_id,
          away_team_name: pair.away.team_name,
          knockout_round,
          knockout_format: 'triple_threat',
          scoring_system: effectiveScoring,
          matchup_mode: 'manual',
          leg: 'first',
          status: 'scheduled',
          scheduled_date: start_date || null,
        });
      });
    } else if (knockout_format === 'single_leg') {
      // One fixture per pairing
      pairings.forEach((pair, idx) => {
        fixturesToCreate.push({
          tournament_id: tournamentId,
          season_id: tournament.season_id,
          round_number,
          match_number: idx + 1,
          home_team_id: pair.home.team_id,
          home_team_name: pair.home.team_name,
          away_team_id: pair.away.team_id,
          away_team_name: pair.away.team_name,
          knockout_round,
          knockout_format,
          scoring_system: effectiveScoring,
          matchup_mode,
          leg: 'first',
          status: 'scheduled',
          scheduled_date: start_date || null,
        });
      });
    } else if (knockout_format === 'two_leg') {
      // Two fixtures per pairing (home and away)
      pairings.forEach((pair, idx) => {
        // Home leg
        fixturesToCreate.push({
          tournament_id: tournamentId,
          season_id: tournament.season_id,
          round_number,
          match_number: idx + 1,
          home_team_id: pair.home.team_id,
          home_team_name: pair.home.team_name,
          away_team_id: pair.away.team_id,
          away_team_name: pair.away.team_name,
          knockout_round,
          knockout_format: isTT ? 'triple_threat' : knockout_format,
          scoring_system: effectiveScoring,
          matchup_mode: isTT ? 'manual' : matchup_mode,
          leg: 'first',
          status: 'scheduled',
          scheduled_date: start_date || null,
        });

        // Away leg
        fixturesToCreate.push({
          tournament_id: tournamentId,
          season_id: tournament.season_id,
          round_number,
          match_number: idx + 1,
          home_team_id: pair.away.team_id,
          home_team_name: pair.away.team_name,
          away_team_id: pair.home.team_id,
          away_team_name: pair.home.team_name,
          knockout_round,
          knockout_format: isTT ? 'triple_threat' : knockout_format,
          scoring_system: effectiveScoring,
          matchup_mode: isTT ? 'manual' : matchup_mode,
          leg: 'second',
          status: 'scheduled',
          scheduled_date: start_date || null,
        });
      });
    } else if (knockout_format === 'round_robin') {
      // One fixture per pairing with 25 matchups
      pairings.forEach((pair, idx) => {
        fixturesToCreate.push({
          tournament_id: tournamentId,
          season_id: tournament.season_id,
          round_number,
          match_number: idx + 1,
          home_team_id: pair.home.team_id,
          home_team_name: pair.home.team_name,
          away_team_id: pair.away.team_id,
          away_team_name: pair.away.team_name,
          knockout_round,
          knockout_format,
          scoring_system,
          matchup_mode,
          leg: 'first',
          status: 'scheduled',
          scheduled_date: start_date || null,
        });
      });
    }

    // Insert fixtures into database
    for (const fixture of fixturesToCreate) {
      // Generate fixture ID
      const fixtureId = `${tournamentId}_ko_r${fixture.round_number}_m${fixture.match_number}_${fixture.leg}`;
      
      await sql`
        INSERT INTO fixtures (
          id,
          tournament_id,
          season_id,
          round_number,
          match_number,
          home_team_id,
          home_team_name,
          away_team_id,
          away_team_name,
          knockout_round,
          knockout_format,
          scoring_system,
          matchup_mode,
          leg,
          status,
          scheduled_date,
          created_at,
          updated_at
        ) VALUES (
          ${fixtureId},
          ${fixture.tournament_id},
          ${fixture.season_id},
          ${fixture.round_number},
          ${fixture.match_number},
          ${fixture.home_team_id},
          ${fixture.home_team_name},
          ${fixture.away_team_id},
          ${fixture.away_team_name},
          ${fixture.knockout_round},
          ${fixture.knockout_format},
          ${fixture.scoring_system},
          ${fixture.matchup_mode},
          ${fixture.leg},
          ${fixture.status},
          ${fixture.scheduled_date || null},
          NOW(),
          NOW()
        )
      `;
    }

    // Ensure round_deadlines entries exist for generated knockout rounds
    const uniqueKnockoutLegs = [...new Set(fixturesToCreate.map(f => f.leg))];
    for (const leg of uniqueKnockoutLegs) {
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
          ${tournament.season_id},
          ${round_number},
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

    return NextResponse.json({
      success: true,
      round_created: knockout_round,
      round_number,
      fixtures_created: fixturesToCreate.length,
      format: knockout_format,
      scoring: scoring_system,
      matchup_mode,
      num_pairings: pairings.length,
      fixtures: fixturesToCreate.map(f => ({
        home_team: f.home_team_name,
        away_team: f.away_team_name,
        leg: f.leg,
        match_number: f.match_number,
      })),
    });
  } catch (error: any) {
    console.error('Error generating knockout round:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate knockout round' },
      { status: 500 }
    );
  }
}
