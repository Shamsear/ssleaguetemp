import { NextRequest, NextResponse } from 'next/server';
import { adminDb as firebaseDb } from '@/lib/firebase/admin';
import { tournamentSql as sql } from '@/lib/neon/tournament-config';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    console.log('[Players API] Starting fetch...');
    
    // Fetch all players from Firebase realplayers collection (limit to prevent timeout)
    const playersSnapshot = await firebaseDb
      .collection('realplayers')
      .orderBy('name')
      .limit(500)
      .get();

    console.log(`[Players API] Found ${playersSnapshot.size} players in Firebase`);

    if (playersSnapshot.empty) {
      console.log('[Players API] No players found in Firebase');
      return NextResponse.json({
        success: true,
        players: []
      });
    }

    // Collect all player IDs
    const playerIds: string[] = [];
    const playerDataMap = new Map();

    playersSnapshot.docs.forEach(playerDoc => {
      const playerData = playerDoc.data();
      const playerId = playerData.player_id || playerDoc.id;
      playerIds.push(playerId);
      playerDataMap.set(playerId, {
        id: playerDoc.id,
        ...playerData
      });
    });

    // Batch fetch all stats - combine from realplayerstats (seasons 1-15) and player_seasons (season 16+)
    console.log('[Players API] Fetching stats from Neon...');
    let allStats = [];
    try {
      // Fetch from realplayerstats (seasons 1-15) - no rating, points as-is
      const oldStats = await sql`
        SELECT 
          player_id,
          COALESCE(SUM(matches_played), 0) as matches_played,
          COALESCE(SUM(goals_scored), 0) as goals_scored,
          COALESCE(SUM(clean_sheets), 0) as clean_sheets,
          COALESCE(SUM(points), 0) as total_points
        FROM realplayerstats
        GROUP BY player_id
      `;
      console.log(`[Players API] Found old stats for ${oldStats.length} players`);

      // Fetch from player_seasons for S16 & S17 - adjusted points (points - base_points)
      const s16s17Stats = await sql`
        SELECT 
          player_id,
          COALESCE(SUM(matches_played), 0) as matches_played,
          COALESCE(SUM(goals_scored), 0) as goals_scored,
          COALESCE(SUM(clean_sheets), 0) as clean_sheets,
          COALESCE(AVG(NULLIF(star_rating, 0)), 0) as average_rating,
          COALESCE(SUM(points - COALESCE(base_points, 0)), 0) as total_points
        FROM player_seasons
        WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
        GROUP BY player_id
      `;
      console.log(`[Players API] Found S16/S17 adjusted stats for ${s16s17Stats.length} players`);

      // Fetch from player_seasons for other seasons (S18+) - points as-is
      const futureStats = await sql`
        SELECT 
          player_id,
          COALESCE(SUM(matches_played), 0) as matches_played,
          COALESCE(SUM(goals_scored), 0) as goals_scored,
          COALESCE(SUM(clean_sheets), 0) as clean_sheets,
          COALESCE(AVG(NULLIF(star_rating, 0)), 0) as average_rating,
          COALESCE(SUM(points), 0) as total_points
        FROM player_seasons
        WHERE season_id NOT IN ('SSPSLS16', 'SSPSLS17')
        GROUP BY player_id
      `;
      console.log(`[Players API] Found future season stats for ${futureStats.length} players`);

      // Combine stats from all three sources
      const statsMap = new Map();
      
      // Add old stats (S1-S15, no rating)
      oldStats.forEach(stat => {
        statsMap.set(stat.player_id, {
          player_id: stat.player_id,
          matches_played: parseInt(stat.matches_played) || 0,
          goals_scored: parseInt(stat.goals_scored) || 0,
          clean_sheets: parseInt(stat.clean_sheets) || 0,
          average_rating: 0, // realplayerstats doesn't have rating
          total_points: parseInt(stat.total_points) || 0
        });
      });

      // Add or merge S16/S17 stats (adjusted points)
      s16s17Stats.forEach(stat => {
        const existing = statsMap.get(stat.player_id);
        if (existing) {
          existing.matches_played += parseInt(stat.matches_played) || 0;
          existing.goals_scored += parseInt(stat.goals_scored) || 0;
          existing.clean_sheets += parseInt(stat.clean_sheets) || 0;
          existing.total_points += parseInt(stat.total_points) || 0;
          existing.average_rating = parseFloat(stat.average_rating) || 0;
        } else {
          statsMap.set(stat.player_id, {
            player_id: stat.player_id,
            matches_played: parseInt(stat.matches_played) || 0,
            goals_scored: parseInt(stat.goals_scored) || 0,
            clean_sheets: parseInt(stat.clean_sheets) || 0,
            average_rating: parseFloat(stat.average_rating) || 0,
            total_points: parseInt(stat.total_points) || 0
          });
        }
      });

      // Add or merge future season stats (S18+, points as-is)
      futureStats.forEach(stat => {
        const existing = statsMap.get(stat.player_id);
        if (existing) {
          existing.matches_played += parseInt(stat.matches_played) || 0;
          existing.goals_scored += parseInt(stat.goals_scored) || 0;
          existing.clean_sheets += parseInt(stat.clean_sheets) || 0;
          existing.total_points += parseInt(stat.total_points) || 0;
          // Keep existing average_rating if already set, otherwise use new
          if (!existing.average_rating) {
            existing.average_rating = parseFloat(stat.average_rating) || 0;
          }
        } else {
          statsMap.set(stat.player_id, {
            player_id: stat.player_id,
            matches_played: parseInt(stat.matches_played) || 0,
            goals_scored: parseInt(stat.goals_scored) || 0,
            clean_sheets: parseInt(stat.clean_sheets) || 0,
            average_rating: parseFloat(stat.average_rating) || 0,
            total_points: parseInt(stat.total_points) || 0
          });
        }
      });

      allStats = Array.from(statsMap.values());
      console.log(`[Players API] Combined stats for ${allStats.length} players (S1-S15 + S16-S17 adjusted + S18+)`);
    } catch (statsError) {
      console.log('[Players API] Could not fetch stats:', statsError.message);
      allStats = [];
    }

    // Create stats lookup map from combined stats
    const statsLookupMap = new Map();
    allStats.forEach(stat => {
      statsLookupMap.set(stat.player_id, stat);
    });

    // Resolve active season ID from Firebase
    let activeSeasonId = null;
    try {
      const seasonsSnapshot = await firebaseDb
        .collection('seasons')
        .where('status', '!=', 'completed')
        .orderBy('status')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
      
      if (!seasonsSnapshot.empty) {
        activeSeasonId = seasonsSnapshot.docs[0].id;
        console.log(`[Players API] Resolved active season ID from Firebase: ${activeSeasonId}`);
      } else {
        const recentSeasonSnapshot = await firebaseDb
          .collection('seasons')
          .where('is_historical', '==', false)
          .orderBy('created_at', 'desc')
          .limit(1)
          .get();
        if (!recentSeasonSnapshot.empty) {
          activeSeasonId = recentSeasonSnapshot.docs[0].id;
          console.log(`[Players API] Fallback to recent season ID: ${activeSeasonId}`);
        }
      }
    } catch (err: any) {
      console.error('[Players API] Error getting active season from Firebase:', err.message);
    }

    // Batch fetch current season info (without teams join since teams are in Firebase)
    let seasonInfo = [];
    try {
      if (activeSeasonId) {
        seasonInfo = await sql`
          SELECT DISTINCT ON (player_id) 
            player_id,
            category,
            team_id,
            star_rating,
            season_id
          FROM player_seasons
          WHERE season_id = ${activeSeasonId}
          ORDER BY player_id, created_at DESC
        `;
        console.log(`[Players API] Found season info for ${seasonInfo.length} players in season ${activeSeasonId}`);
      } else {
        // Fallback: get the latest recorded season for each player
        seasonInfo = await sql`
          SELECT DISTINCT ON (player_id) 
            player_id,
            category,
            team_id,
            star_rating,
            season_id
          FROM player_seasons
          ORDER BY player_id, season_id DESC, created_at DESC
        `;
        console.log(`[Players API] Found fallback season info for ${seasonInfo.length} players`);
      }
    } catch (seasonError: any) {
      console.error('[Players API] Could not fetch season info:', seasonError.message);
      seasonInfo = [];
    }

    // Fetch team names from Firebase for players with team_id (with Firestore IN query chunking)
    const teamIds = [...new Set(seasonInfo.map(s => s.team_id).filter(Boolean))];
    const teamsMap = new Map();
    if (teamIds.length > 0) {
      console.log(`[Players API] Fetching ${teamIds.length} teams from Firebase...`);
      try {
        const chunkSize = 30;
        for (let i = 0; i < teamIds.length; i += chunkSize) {
          const chunk = teamIds.slice(i, i + chunkSize);
          const teamsSnapshot = await firebaseDb
            .collection('teams')
            .where('__name__', 'in', chunk)
            .get();
          teamsSnapshot.docs.forEach(doc => {
            teamsMap.set(doc.id, doc.data().name);
          });
        }
        console.log(`[Players API] Resolved ${teamsMap.size} team names`);
      } catch (teamsError: any) {
        console.error('[Players API] Error fetching team names:', teamsError.message);
      }
    }

    // Create season info lookup map
    const seasonMap = new Map();
    seasonInfo.forEach(info => {
      seasonMap.set(info.player_id, {
        ...info,
        team_name: teamsMap.get(info.team_id) || null
      });
    });

    // Combine all data
    const playersWithStats = playerIds.map(playerId => {
      const playerData = playerDataMap.get(playerId);
      const stats = statsLookupMap.get(playerId);
      const season = seasonMap.get(playerId);

      return {
        id: playerData.id,
        player_id: playerId,
        name: playerData.name,
        display_name: playerData.display_name || playerData.name,
        category: season?.category || playerData.category || null,
        star_rating: season?.star_rating || null,
        season_id: season?.season_id || null,
        team: playerData.team,
        team_name: season?.team_name || playerData.team || null,
        photo_url: playerData.photo_url || null,
        // Photo positioning for circle shape
        photo_position_circle: playerData.photo_position_circle || null,
        photo_scale_circle: playerData.photo_scale_circle || null,
        photo_position_x_circle: playerData.photo_position_x_circle || null,
        photo_position_y_circle: playerData.photo_position_y_circle || null,
        // Photo positioning for square shape
        photo_position_square: playerData.photo_position_square || null,
        photo_scale_square: playerData.photo_scale_square || null,
        photo_position_x_square: playerData.photo_position_x_square || null,
        photo_position_y_square: playerData.photo_position_y_square || null,
        current_season_id: playerData.current_season_id || null,
        matches_played: parseInt(stats?.matches_played) || 0,
        goals_scored: parseInt(stats?.goals_scored) || 0,
        clean_sheets: parseInt(stats?.clean_sheets) || 0,
        average_rating: parseFloat(stats?.average_rating) || 0,
        total_points: parseInt(stats?.total_points) || 0
      };
    });

    console.log(`[Players API] Returning ${playersWithStats.length} players with stats`);
    
    return NextResponse.json({
      success: true,
      players: playersWithStats,
      count: playersWithStats.length
    });
  } catch (error: any) {
    console.error('[Players API] Error:', error);
    console.error('[Players API] Error stack:', error.stack);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch players', details: error.stack },
      { status: 500 }
    );
  }
}
