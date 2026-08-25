import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * POST /api/lineups/auto-populate
 * Automatically populate lineups for teams with exactly 5 players (minimum squad)
 * This should be called when the away team deadline passes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season_id, round_number, leg } = body;

    if (!season_id || !round_number) {
      return NextResponse.json(
        { error: 'Missing required fields: season_id, round_number' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();
    const legValue = leg || 'first';

    console.log(`🤖 Auto-populating lineups for Season ${season_id}, Round ${round_number}, Leg ${legValue}`);

    // Get all fixtures for this round
    const fixtures = await sql`
      SELECT 
        id,
        home_team_id,
        home_team_name,
        away_team_id,
        away_team_name
      FROM fixtures
      WHERE season_id = ${season_id}
        AND round_number = ${round_number}
        AND leg = ${legValue}
    `;

    console.log(`Found ${fixtures.length} fixtures`);

    let autoPopulatedCount = 0;
    const results = [];

    for (const fixture of fixtures) {
      // Check home team lineup in Neon
      const homeLineupRows = await sql`
        SELECT id FROM fixture_lineups
        WHERE fixture_id = ${fixture.id} AND team_id = ${fixture.home_team_id}
        LIMIT 1
      `;
      const homeLineupExists = homeLineupRows.length > 0;

      if (!homeLineupExists) {
        const homeTeamPlayers = await getTeamPlayers(fixture.home_team_id, season_id);
        
        if (homeTeamPlayers.length === 5) {
          console.log(`✅ Auto-populating lineup for ${fixture.home_team_name} (5 players)`);
          
          const lineup = createAutoLineup(homeTeamPlayers, 'system_auto');
          
          // Save to Neon fixture_lineups
          const flId = `fl_${fixture.id}_${fixture.home_team_id}`;
          await sql`
            INSERT INTO fixture_lineups (
              id, fixture_id, team_id, season_id, selected_players,
              is_locked, submitted_by, submitted_at, auto_populated, created_at, updated_at
            ) VALUES (
              ${flId}, ${fixture.id}, ${fixture.home_team_id}, ${season_id},
              ${JSON.stringify(lineup.players)}, false, 'system_auto', NOW(), true, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE SET selected_players = EXCLUDED.selected_players, updated_at = NOW()
          `;
          
          autoPopulatedCount++;
          results.push({
            fixture_id: fixture.id,
            team: fixture.home_team_name,
            team_id: fixture.home_team_id,
            player_count: 5,
            action: 'auto_populated'
          });
        } else {
          console.log(`⏭️  Skipping ${fixture.home_team_name} (${homeTeamPlayers.length} players)`);
          results.push({
            fixture_id: fixture.id,
            team: fixture.home_team_name,
            team_id: fixture.home_team_id,
            player_count: homeTeamPlayers.length,
            action: 'skipped_not_minimum'
          });
        }
      }

      // Check away team lineup in Neon
      const awayLineupRows = await sql`
        SELECT id FROM fixture_lineups
        WHERE fixture_id = ${fixture.id} AND team_id = ${fixture.away_team_id}
        LIMIT 1
      `;
      const awayLineupExists = awayLineupRows.length > 0;

      if (!awayLineupExists) {
        const awayTeamPlayers = await getTeamPlayers(fixture.away_team_id, season_id);
        
        if (awayTeamPlayers.length === 5) {
          console.log(`✅ Auto-populating lineup for ${fixture.away_team_name} (5 players)`);
          
          const lineup = createAutoLineup(awayTeamPlayers, 'system_auto');
          
          // Save to Neon fixture_lineups
          const flId2 = `fl_${fixture.id}_${fixture.away_team_id}`;
          await sql`
            INSERT INTO fixture_lineups (
              id, fixture_id, team_id, season_id, selected_players,
              is_locked, submitted_by, submitted_at, auto_populated, created_at, updated_at
            ) VALUES (
              ${flId2}, ${fixture.id}, ${fixture.away_team_id}, ${season_id},
              ${JSON.stringify(lineup.players)}, false, 'system_auto', NOW(), true, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE SET selected_players = EXCLUDED.selected_players, updated_at = NOW()
          `;
          
          autoPopulatedCount++;
          results.push({
            fixture_id: fixture.id,
            team: fixture.away_team_name,
            team_id: fixture.away_team_id,
            player_count: 5,
            action: 'auto_populated'
          });
        } else {
          console.log(`⏭️  Skipping ${fixture.away_team_name} (${awayTeamPlayers.length} players)`);
          results.push({
            fixture_id: fixture.id,
            team: fixture.away_team_name,
            team_id: fixture.away_team_id,
            player_count: awayTeamPlayers.length,
            action: 'skipped_not_minimum'
          });
        }
      }
    }

    console.log(`\n✅ Auto-populated ${autoPopulatedCount} lineup(s)`);

    return NextResponse.json({
      success: true,
      message: `Auto-populated ${autoPopulatedCount} lineup(s) for teams with 5 players`,
      auto_populated: autoPopulatedCount,
      details: results
    });

  } catch (error: any) {
    console.error('Error auto-populating lineups:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to auto-populate lineups' },
      { status: 500 }
    );
  }
}

/**
 * Get team players from Firebase
 */
async function getTeamPlayers(teamId: string, seasonId: string) {
  try {
    const teamPlayersSnapshot = await adminDb
      .collection('team_players')
      .where('team_id', '==', teamId)
      .where('season_id', '==', seasonId)
      .where('status', '==', 'active')
      .get();

    return teamPlayersSnapshot.docs.map(doc => ({
      player_id: doc.data().player_id,
      player_name: doc.data().player_name,
    }));
  } catch (error) {
    console.error(`Error fetching players for team ${teamId}:`, error);
    return [];
  }
}

/**
 * Create automatic lineup with all 5 players (no substitute since there's no 6th player)
 */
function createAutoLineup(players: any[], submittedBy: string) {
  return {
    players: players.map((player, index) => ({
      player_id: player.player_id,
      player_name: player.player_name,
      position: index + 1,
      is_substitute: false // All 5 players are starters
    })),
    locked: false,
    submitted_by: submittedBy,
    submitted_at: new Date().toISOString(),
    auto_populated: true,
    note: 'Automatically populated - team has minimum squad size (5 players)'
  };
}
