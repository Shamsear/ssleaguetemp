import { NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

/**
 * GET /api/public/hall-of-fame
 * Returns all-time player records across all seasons
 */
export async function GET() {
  try {
    const sql = getTournamentDb();
    
    // Top Scorers (All-Time)
    const topScorers = await sql`
      SELECT 
        player_id,
        MAX(player_name) as player_name,
        SUM(goals_scored) as total_goals,
        SUM(matches_played) as total_matches,
        COUNT(DISTINCT season_id) as seasons_played,
        ROUND(SUM(goals_scored)::numeric / NULLIF(SUM(matches_played), 0), 2) as goals_per_game
      FROM (
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, COALESCE(points, 0) as points
        FROM realplayerstats
        WHERE season_id NOT IN ('SSPSLS16', 'SSPSLS17')
        UNION ALL
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, (COALESCE(points, 0) - COALESCE(base_points, 0)) as points
        FROM player_seasons
        WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ) as realplayerstats
      GROUP BY player_id
      HAVING SUM(goals_scored) > 0
      ORDER BY total_goals DESC
      LIMIT 10
    `;
    
    // Top Assist Providers
    const topAssisters = await sql`
      SELECT 
        player_id,
        MAX(player_name) as player_name,
        SUM(assists) as total_assists,
        SUM(matches_played) as total_matches,
        COUNT(DISTINCT season_id) as seasons_played
      FROM (
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, COALESCE(points, 0) as points
        FROM realplayerstats
        WHERE season_id NOT IN ('SSPSLS16', 'SSPSLS17')
        UNION ALL
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, (COALESCE(points, 0) - COALESCE(base_points, 0)) as points
        FROM player_seasons
        WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ) as realplayerstats
      GROUP BY player_id
      HAVING SUM(assists) > 0
      ORDER BY total_assists DESC
      LIMIT 10
    `;
    
    // Clean Sheet Kings
    const cleanSheetKings = await sql`
      SELECT 
        player_id,
        MAX(player_name) as player_name,
        SUM(clean_sheets) as total_clean_sheets,
        SUM(matches_played) as total_matches,
        COUNT(DISTINCT season_id) as seasons_played
      FROM (
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, COALESCE(points, 0) as points
        FROM realplayerstats
        WHERE season_id NOT IN ('SSPSLS16', 'SSPSLS17')
        UNION ALL
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, (COALESCE(points, 0) - COALESCE(base_points, 0)) as points
        FROM player_seasons
        WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ) as realplayerstats
      GROUP BY player_id
      HAVING SUM(clean_sheets) > 0
      ORDER BY total_clean_sheets DESC
      LIMIT 10
    `;
    
    // Most Appearances
    const mostAppearances = await sql`
      SELECT 
        player_id,
        MAX(player_name) as player_name,
        SUM(matches_played) as total_matches,
        SUM(wins) as total_wins,
        COUNT(DISTINCT season_id) as seasons_played,
        SUM(goals_scored) as total_goals
      FROM (
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, COALESCE(points, 0) as points
        FROM realplayerstats
        WHERE season_id NOT IN ('SSPSLS16', 'SSPSLS17')
        UNION ALL
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, (COALESCE(points, 0) - COALESCE(base_points, 0)) as points
        FROM player_seasons
        WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ) as realplayerstats
      GROUP BY player_id
      ORDER BY total_matches DESC
      LIMIT 10
    `;
    
    // Most Points
    const mostPoints = await sql`
      SELECT 
        player_id,
        MAX(player_name) as player_name,
        SUM(points) as total_points,
        SUM(matches_played) as total_matches,
        COUNT(DISTINCT season_id) as seasons_played
      FROM (
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, COALESCE(points, 0) as points
        FROM realplayerstats
        WHERE season_id NOT IN ('SSPSLS16', 'SSPSLS17')
        UNION ALL
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, (COALESCE(points, 0) - COALESCE(base_points, 0)) as points
        FROM player_seasons
        WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ) as realplayerstats
      GROUP BY player_id
      HAVING SUM(points) > 0
      ORDER BY total_points DESC
      LIMIT 10
    `;
    
    // Best Win Rate (minimum 20 matches)
    const bestWinRate = await sql`
      SELECT 
        player_id,
        MAX(player_name) as player_name,
        SUM(wins) as total_wins,
        SUM(matches_played) as total_matches,
        ROUND((SUM(wins)::numeric / NULLIF(SUM(matches_played), 0)) * 100, 1) as win_rate,
        COUNT(DISTINCT season_id) as seasons_played
      FROM (
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, COALESCE(points, 0) as points
        FROM realplayerstats
        WHERE season_id NOT IN ('SSPSLS16', 'SSPSLS17')
        UNION ALL
        SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, (COALESCE(points, 0) - COALESCE(base_points, 0)) as points
        FROM player_seasons
        WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ) as realplayerstats
      GROUP BY player_id
      HAVING SUM(matches_played) >= 20
      ORDER BY win_rate DESC
      LIMIT 10
    `;
    
    // Fetch photos from Firebase
    const allPlayerIds = new Set([
      ...topScorers.map(p => p.player_id),
      ...topAssisters.map(p => p.player_id),
      ...cleanSheetKings.map(p => p.player_id),
      ...mostAppearances.map(p => p.player_id),
      ...mostPoints.map(p => p.player_id),
      ...bestWinRate.map(p => p.player_id)
    ]);

    const photoUrls: Record<string, string> = {};
    if (allPlayerIds.size > 0) {
      const { adminDb } = await import('@/lib/firebase/admin');
      const uniqueIds = Array.from(allPlayerIds);
      
      for (let i = 0; i < uniqueIds.length; i += 30) {
        const chunk = uniqueIds.slice(i, i + 30);
        try {
          const snap = await adminDb.collection('realplayers').where('__name__', 'in', chunk).get();
          snap.forEach(doc => {
            if (doc.data().photo_url) {
              photoUrls[doc.id] = doc.data().photo_url;
            }
          });
        } catch (err) {
          console.error('Error fetching player photos chunk:', err);
        }
      }
    }

    const attachPhoto = (list: any[]) => list.map(p => ({ ...p, photo_url: photoUrls[p.player_id] || null }));

    return NextResponse.json({
      success: true,
      data: {
        topScorers: attachPhoto(topScorers),
        topAssisters: attachPhoto(topAssisters),
        cleanSheetKings: attachPhoto(cleanSheetKings),
        mostAppearances: attachPhoto(mostAppearances),
        mostPoints: attachPhoto(mostPoints),
        bestWinRate: attachPhoto(bestWinRate)
      }
    });
  } catch (error: any) {
    console.error('Error fetching Hall of Fame:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
