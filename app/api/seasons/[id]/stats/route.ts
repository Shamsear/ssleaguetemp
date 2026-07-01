import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { tournamentSql as sql } from '@/lib/neon/tournament-config';

// Cache for 5 minutes
export const revalidate = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: seasonId } = await params;
    console.log(`[Season Stats API] Fetching stats for season: ${seasonId}`);

    // Fetch team stats from tournament DB
    const teamStats = await sql`
      SELECT 
        team_id,
        team_name,
        SUM(matches_played) as matches_played,
        SUM(wins) as wins,
        SUM(draws) as draws,
        SUM(losses) as losses,
        SUM(goals_for) as goals_scored,
        SUM(goals_against) as goals_conceded,
        SUM(points) as points,
        MIN(position) as rank
      FROM teamstats
      WHERE LOWER(season_id) = LOWER(${seasonId})
      GROUP BY team_id, team_name
      ORDER BY points DESC, (SUM(goals_for) - SUM(goals_against)) DESC
    `;

    console.log(`[Season Stats API] Found ${teamStats.length} teams`);

    // Fetch team logos from Firebase in parallel batches
    const teamIds = teamStats.map(t => t.team_id);
    const teamsMap = new Map();
    
    if (teamIds.length > 0) {
      console.log(`[Season Stats API] Fetching logos for ${teamIds.length} teams...`);
      // Fetch all batches in parallel for speed
      const batches = [];
      for (let i = 0; i < teamIds.length; i += 30) {
        const batch = teamIds.slice(i, i + 30);
        batches.push(
          adminDb
            .collection('teams')
            .where('__name__', 'in', batch)
            .get()
        );
      }
      
      const snapshots = await Promise.all(batches);
      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          teamsMap.set(doc.id, {
            logo_url: data.logo_url || null
          });
        });
      });
      console.log(`[Season Stats API] Fetched ${teamsMap.size} team logos`);
    }

    // Determine if season uses player_seasons or realplayerstats
    const seasonNum = parseInt(seasonId.match(/\d+/)?.[0] || '0');
    const isModernSeason = seasonNum === 16 || seasonNum === 17;
    const isAdjustedSeason = seasonNum === 16 || seasonNum === 17;

    let playerStats;
    if (isModernSeason) {
      // Season 16+: Use player_seasons table
      if (isAdjustedSeason) {
        playerStats = await sql`
          SELECT 
            player_id,
            player_name,
            team_id,
            team as team_name,
            category,
            star_rating,
            base_points,
            matches_played,
            goals_scored,
            goals_conceded,
            wins,
            draws,
            losses,
            clean_sheets,
            points
          FROM player_seasons
          WHERE LOWER(season_id) = LOWER(${seasonId})
          ORDER BY (points - COALESCE(base_points, 0)) DESC
        `;
      } else {
        playerStats = await sql`
          SELECT 
            player_id,
            player_name,
            team_id,
            team as team_name,
            category,
            star_rating,
            base_points,
            matches_played,
            goals_scored,
            goals_conceded,
            wins,
            draws,
            losses,
            clean_sheets,
            points
          FROM player_seasons
          WHERE LOWER(season_id) = LOWER(${seasonId})
          ORDER BY points DESC
        `;
      }
    } else {
      // Season 1-15: Use realplayerstats table (no rating column)
      playerStats = await sql`
        SELECT 
          player_id,
          player_name,
          team_id,
          team as team_name,
          category,
          matches_played,
          goals_scored,
          goals_conceded,
          wins,
          draws,
          losses,
          clean_sheets,
          points
        FROM realplayerstats
        WHERE LOWER(season_id) = LOWER(${seasonId})
        ORDER BY points DESC
      `;
    }

    console.log(`[Season Stats API] Found ${playerStats.length} players`);

    // Combine team stats with logos
    const teams = teamStats.map((team, index) => ({
      team_id: team.team_id,
      team_name: team.team_name,
      rank: team.rank || index + 1,
      matches_played: parseInt(team.matches_played) || 0,
      wins: parseInt(team.wins) || 0,
      draws: parseInt(team.draws) || 0,
      losses: parseInt(team.losses) || 0,
      goals_scored: parseInt(team.goals_scored) || 0,
      goals_conceded: parseInt(team.goals_conceded) || 0,
      points: parseInt(team.points) || 0,
      logo_url: teamsMap.get(team.team_id)?.logo_url || null
    }));

    // Format player stats
    const players = playerStats.map(player => {
      const basePoints = parseInt(player.base_points) || 0;
      const rawPoints = parseInt(player.points) || 0;
      const points = isAdjustedSeason ? (rawPoints - basePoints) : rawPoints;

      return {
        player_id: player.player_id,
        player_name: player.player_name,
        team_id: player.team_id,
        team_name: player.team_name,
        category: player.category,
        star_rating: player.star_rating || null,
        rating: player.rating || null,
        matches_played: parseInt(player.matches_played) || 0,
        wins: parseInt(player.wins) || 0,
        draws: parseInt(player.draws) || 0,
        losses: parseInt(player.losses) || 0,
        goals_scored: parseInt(player.goals_scored) || 0,
        goals_conceded: parseInt(player.goals_conceded) || 0,
        clean_sheets: parseInt(player.clean_sheets) || 0,
        points: points,
        base_points: basePoints,
        raw_points: rawPoints
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        teams,
        players,
        seasonId,
        isModernSeason
      }
    });

  } catch (error: any) {
    console.error('[Season Stats API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch season stats'
      },
      { status: 500 }
    );
  }
}
