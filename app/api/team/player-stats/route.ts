import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * GET /api/team/player-stats
 * Get player statistics for the logged-in team
 * Calculates stats dynamically from matchups table based on round range
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { verifyAuth } = await import('@/lib/auth-helper');
    const auth = await verifyAuth(['team'], request);

    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = auth.userId!;
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id');
    const fromRound = parseInt(searchParams.get('from_round') || '1');
    const toRound = parseInt(searchParams.get('to_round') || '999');

    if (!seasonId) {
      return NextResponse.json(
        { error: 'season_id is required' },
        { status: 400 }
      );
    }

    // Get team ID from Firebase team_seasons
    let teamSeasonId = `${userId}_${seasonId}`;
    let teamSeasonDoc = await adminDb.collection('team_seasons').doc(teamSeasonId).get();

    if (!teamSeasonDoc.exists) {
      // Fallback: Query by user_id field
      const teamSeasonQuery = await adminDb.collection('team_seasons')
        .where('user_id', '==', userId)
        .where('season_id', '==', seasonId)
        .where('status', '==', 'registered')
        .limit(1)
        .get();

      if (teamSeasonQuery.empty) {
        return NextResponse.json(
          { error: 'Team not registered for this season' },
          { status: 404 }
        );
      }

      teamSeasonDoc = teamSeasonQuery.docs[0];
      teamSeasonId = teamSeasonDoc.id;
    }

    const teamSeasonData = teamSeasonDoc.data();
    const teamId = teamSeasonData?.team_id;

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID not found' },
        { status: 404 }
      );
    }

    const sql = getTournamentDb();

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    // Get base player info from correct table, fallback to teamSeasonData real_players or Firestore realplayers
    let playerInfo: any[] = [];
    try {
      if (isModern) {
        playerInfo = await sql`
          SELECT 
            id, player_id, player_name, season_id, team, team_id,
            points as total_points, base_points, star_rating, category, auction_value
          FROM player_seasons
          WHERE (team_id = ${teamId} OR team_id = ${teamSeasonId})
            AND season_id = ${seasonId}
        `;
      } else {
        playerInfo = await sql`
          SELECT 
            id, player_id, player_name, season_id, team, team_id,
            points as total_points, 0 as base_points, star_rating, category, 0 as auction_value
          FROM realplayerstats
          WHERE (team_id = ${teamId} OR team_id = ${teamSeasonId})
            AND season_id = ${seasonId}
        `;
      }
    } catch (dbErr) {
      console.warn('[team player-stats API] Neon query error:', dbErr);
      playerInfo = [];
    }

    // Fallback: If playerInfo empty or incomplete, load from teamSeasonData.real_players or Firestore realplayers
    if (!playerInfo || playerInfo.length === 0) {
      const realPlayersArr = teamSeasonData?.real_players || teamSeasonData?.realPlayers || [];
      if (Array.isArray(realPlayersArr) && realPlayersArr.length > 0) {
        playerInfo = realPlayersArr.map((rp: any) => ({
          id: `${rp.player_id || rp.id}_${seasonId}`,
          player_id: String(rp.player_id || rp.id),
          player_name: rp.name || rp.player_name || 'Unknown Player',
          season_id: seasonId,
          team: teamSeasonData?.team_name || 'My Team',
          total_points: rp.points || 0,
          base_points: 0,
          star_rating: 3,
          category: rp.category || 'Red',
          auction_value: 0
        }));
      } else {
        // Query Firestore realplayers for this team
        try {
          const snapshot = await adminDb.collection('realplayers')
            .where('team_id', '==', teamId)
            .get();
          playerInfo = snapshot.docs.map((doc: any) => {
            const d = doc.data();
            return {
              id: `${d.player_id || doc.id}_${seasonId}`,
              player_id: String(d.player_id || doc.id),
              player_name: d.name || d.player_name || 'Unknown Player',
              season_id: seasonId,
              team: d.team || teamSeasonData?.team_name || 'My Team',
              total_points: d.points || 0,
              base_points: 0,
              star_rating: 3,
              category: d.category || 'Red',
              auction_value: 0
            };
          });
        } catch (err) {
          console.error('[team player-stats API] Firestore realplayers fallback error:', err);
        }
      }
    }

    // Calculate stats from matchups table for the selected round range
    let statsFromMatchups: any[] = [];
    try {
      statsFromMatchups = await sql`
        WITH player_matches AS (
          SELECT 
            m.fixture_id,
            m.round_number,
            m.home_player_id,
            m.away_player_id,
            m.home_goals,
            m.away_goals,
            CASE 
              WHEN m.home_player_id = p.player_id THEN 'home'
              WHEN m.away_player_id = p.player_id THEN 'away'
            END as side,
            p.player_id,
            p.id as player_season_id,
            CASE 
              WHEN m.home_player_id = p.player_id THEN m.home_goals
              WHEN m.away_player_id = p.player_id THEN m.away_goals
            END as goals_scored,
            CASE 
              WHEN m.home_player_id = p.player_id THEN m.away_goals
              WHEN m.away_player_id = p.player_id THEN m.home_goals
            END as goals_conceded
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          JOIN (
            SELECT unnest(${playerInfo.map(p => p.player_id)}::text[]) as player_id,
                   unnest(${playerInfo.map(p => p.id)}::text[]) as id
          ) p ON (m.home_player_id = p.player_id OR m.away_player_id = p.player_id)
          WHERE m.season_id = ${seasonId}
            AND m.round_number >= ${fromRound}
            AND m.round_number <= ${toRound}
            AND f.status = 'completed'
            AND m.home_goals IS NOT NULL
            AND m.away_goals IS NOT NULL
        )
        SELECT 
          player_season_id,
          player_id,
          COUNT(*) as matches_played,
          SUM(goals_scored) as goals_scored,
          SUM(goals_conceded) as goals_conceded,
          SUM(goals_scored) - SUM(goals_conceded) as goal_difference,
          SUM(CASE WHEN goals_scored > goals_conceded THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN goals_scored = goals_conceded THEN 1 ELSE 0 END) as draws,
          SUM(CASE WHEN goals_scored < goals_conceded THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN goals_conceded = 0 THEN 1 ELSE 0 END) as clean_sheets,
          SUM(CASE WHEN goals_scored > goals_conceded THEN 8 WHEN goals_scored = goals_conceded THEN 4 ELSE 1 END) as calculated_points
        FROM player_matches
        GROUP BY player_season_id, player_id
      `;
    } catch (err) {
      console.warn('[team player-stats API] Neon matchups aggregation warning:', err);
      statsFromMatchups = [];
    }

    // Merge player info with calculated stats
    const players = playerInfo.map(player => {
      const stats = statsFromMatchups.find(s => s.player_id === player.player_id || s.player_season_id === player.id);
      const isFilteredRange = fromRound > 1 || toRound < 999;
      const displayPoints = isFilteredRange ? Number(stats?.calculated_points || 0) : Number(player.total_points || stats?.calculated_points || 0);

      return {
        id: player.id,
        player_id: player.player_id,
        player_name: player.player_name,
        season_id: player.season_id,
        team: player.team,
        points: displayPoints,
        matches_played: Number(stats?.matches_played || 0),
        goals_scored: Number(stats?.goals_scored || 0),
        goals_conceded: Number(stats?.goals_conceded || 0),
        goal_difference: Number(stats?.goal_difference || 0),
        wins: Number(stats?.wins || 0),
        draws: Number(stats?.draws || 0),
        losses: Number(stats?.losses || 0),
        clean_sheets: Number(stats?.clean_sheets || 0),
        auction_value: player.auction_value ? Number(player.auction_value) : undefined,
        star_rating: Number(player.star_rating || 3),
      };
    });

    // Sort by points
    players.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_scored - a.goals_scored;
    });

    // Get max round number from matchups table
    let maxRound = 10;
    try {
      const maxRoundResult = await sql`
        SELECT MAX(round_number) as max_round
        FROM matchups
        WHERE season_id = ${seasonId}
      `;
      maxRound = maxRoundResult[0]?.max_round || 10;
    } catch (error) {
      console.log('Could not determine max round from matchups, using default:', error);
    }

    return NextResponse.json({
      players,
      maxRound,
      teamName: teamSeasonData?.team_name || 'My Team'
    });

  } catch (error: any) {
    console.error('Error fetching team player stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch player stats' },
      { status: 500 }
    );
  }
}
