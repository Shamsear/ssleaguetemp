import { NextRequest, NextResponse } from 'next/server';
import { adminDb as firebaseDb } from '@/lib/neon/admin-db-wrapper';
import { tournamentSql as sql } from '@/lib/neon/tournament-config';
import { neonGetActiveSeason } from '@/lib/neon/seasons';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    playersSnapshot.docs.forEach((playerDoc: any) => {
      const playerData = playerDoc.data();
      const playerId = playerData.player_id || playerDoc.id;
      playerIds.push(playerId);
      playerDataMap.set(playerId, {
        id: playerDoc.id,
        ...playerData
      });
    });

    // Batch fetch all stats - combine from realplayerstats (seasons 1-15, 18+) and player_seasons (season 16 & 17)
    console.log('[Players API] Fetching stats from Neon...');
    let allStats = [];
    try {
      // Fetch from realplayerstats - exclude S16 & S17 (which are in player_seasons) to avoid double counting
      const oldStats = await sql`
        SELECT 
          player_id,
          COALESCE(SUM(matches_played), 0) as matches_played,
          COALESCE(SUM(goals_scored), 0) as goals_scored,
          COALESCE(SUM(clean_sheets), 0) as clean_sheets,
          COALESCE(SUM(points), 0) as total_points
        FROM realplayerstats
        WHERE season_id NOT LIKE 'SSPSLS16%' AND season_id NOT LIKE 'SSPSLS17%'
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
        WHERE season_id LIKE 'SSPSLS16%' OR season_id LIKE 'SSPSLS17%'
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
        WHERE season_id NOT LIKE 'SSPSLS16%' AND season_id NOT LIKE 'SSPSLS17%' AND matches_played > 0
        GROUP BY player_id
      `;
      console.log(`[Players API] Found future season stats for ${futureStats.length} players`);

      // Combine stats from all three sources
      const statsMap = new Map();
      
      // Add old stats (S1-S15, no rating)
      oldStats.forEach((stat: any) => {
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
      s16s17Stats.forEach((stat: any) => {
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
      futureStats.forEach((stat: any) => {
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
    } catch (statsError: any) {
      console.log('[Players API] Could not fetch stats:', statsError?.message);
      allStats = [];
    }

    // Create stats lookup map from combined stats
    const statsLookupMap = new Map();
    allStats.forEach((stat: any) => {
      statsLookupMap.set(stat.player_id, stat);
    });

    // 1. Check if a specific season was requested via query param
    const requestedSeason = request.nextUrl.searchParams.get('season') || request.nextUrl.searchParams.get('season_id');

    // 2. Resolve active season from Neon Main DB
    let activeSeasonId = 'SSPSLS19';
    try {
      const activeSeason = await neonGetActiveSeason();
      if (activeSeason && activeSeason.id) {
        activeSeasonId = activeSeason.id;
      }
    } catch (err: any) {
      console.warn('[Players API] Error resolving active season via neonGetActiveSeason:', err?.message);
    }

    const targetSeasonId = requestedSeason || activeSeasonId;
    console.log(`[Players API] Using target season: ${targetSeasonId} (active: ${activeSeasonId})`);

    // Get season info (team/category) for targetSeasonId
    let seasonInfo: any[] = [];
    try {
      const targetSeasonNum = parseInt(targetSeasonId.replace(/\D/g, '')) || 0;
      const isPlayerSeasonsSeason = targetSeasonNum === 16 || targetSeasonNum === 17;

      if (isPlayerSeasonsSeason) {
        // Query player_seasons table to get team/category for target season
        seasonInfo = await sql`
          SELECT DISTINCT ON (player_id) 
            player_id,
            category,
            team_id,
            star_rating,
            season_id
          FROM player_seasons
          WHERE season_id = ${targetSeasonId}
          ORDER BY player_id, created_at DESC
        `;
      } else {
        // Query realplayerstats table to get team/category for target season
        seasonInfo = await sql`
          SELECT DISTINCT ON (player_id) 
            player_id,
            category,
            team_id,
            team as team_name,
            NULL as star_rating,
            season_id
          FROM realplayerstats
          WHERE season_id = ${targetSeasonId}
          ORDER BY player_id, created_at DESC
        `;
      }
      console.log(`[Players API] Found season info for ${seasonInfo.length} players in season ${targetSeasonId}`);
    } catch (seasonError: any) {
      console.error('[Players API] Could not fetch season info:', seasonError.message);
      seasonInfo = [];
    }

    // Fetch team names from team_seasons and teams
    const teamsMap = new Map();
    try {
      const teamSeasonsSnapshot = await firebaseDb
        .collection('team_seasons')
        .get();
      
      teamSeasonsSnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        const teamId = data.team_id || doc.id.split('_')[0];
        const name = data.team_name || data.team_code || 'Unknown Team';
        teamsMap.set(teamId, name);
      });

      const teamsSnapshot = await firebaseDb.collection('teams').get();
      teamsSnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.name) {
          teamsMap.set(doc.id, data.name);
          if (data.team_id) teamsMap.set(data.team_id, data.name);
        }
      });
      console.log(`[Players API] Resolved ${teamsMap.size} team names`);
    } catch (teamsError: any) {
      console.error('[Players API] Error fetching team names:', teamsError.message);
    }

    // Create season info lookup map
    const seasonMap = new Map();
    seasonInfo.forEach((info: any) => {
      const resolvedTeamName = info.team_name || (info.team_id ? teamsMap.get(info.team_id) : null) || null;
      seasonMap.set(info.player_id, {
        ...info,
        team_name: resolvedTeamName
      });
    });

    // Combine all data
    const playersWithStats = playerIds.map((playerId: any) => {
      const playerData = playerDataMap.get(playerId);
      const stats = statsLookupMap.get(playerId);
      const season = seasonMap.get(playerId);

      // Category: target season category if registered in target season, else fallback to player profile category
      const category = season?.category || playerData.category || null;
      // Team: MUST only come from the target season! Never fall back to playerData.team from past seasons!
      const teamName = season?.team_name || null;

      return {
        id: playerData.id,
        player_id: playerId,
        name: playerData.name,
        display_name: playerData.display_name || playerData.name,
        category: category,
        star_rating: season?.star_rating || null,
        season_id: season?.season_id || targetSeasonId || null,
        team: teamName,
        team_name: teamName,
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
        current_season_id: targetSeasonId,
        matches_played: parseInt(stats?.matches_played) || 0,
        goals_scored: parseInt(stats?.goals_scored) || 0,
        clean_sheets: parseInt(stats?.clean_sheets) || 0,
        average_rating: parseFloat(stats?.average_rating) || 0,
        total_points: parseInt(stats?.total_points) || 0
      };
    });

    console.log(`[Players API] Returning ${playersWithStats.length} players with stats for season ${targetSeasonId}`);
    
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
