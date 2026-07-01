import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(request: NextRequest) {
  try {
    // Verify team authentication
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'seasonId is required' },
        { status: 400 }
      );
    }

    const uid = auth.userId!;
    const sql = getTournamentDb();

    // Get the team's ID from Firebase team_seasons collection using Firebase UID
    console.log(`🔍 Fetching team_season for uid: ${uid}, season: ${seasonId}`);
    
    const teamSeasonsQuery = await adminDb
      .collection('team_seasons')
      .where('user_id', '==', uid)
      .where('season_id', '==', seasonId)
      .where('status', '==', 'registered')
      .limit(1)
      .get();

    if (teamSeasonsQuery.empty) {
      console.log(`No team found in Firebase for uid: ${uid}, season: ${seasonId}`);
      return NextResponse.json({
        success: true,
        data: {
          players: [],
          count: 0,
          teamInfo: null
        },
      });
    }

    const teamSeasonDoc = teamSeasonsQuery.docs[0];
    const teamSeasonData = teamSeasonDoc.data();
    const teamId = teamSeasonData.team_id;
    const teamName = teamSeasonData.team_name;
    
    console.log(`✅ Found team in Firebase: ${teamId} (${teamName})`);

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    // Fetch team's players from correct database table
    let playersResult;
    if (isModern) {
      playersResult = await sql`
        SELECT 
          id,
          player_id,
          player_name,
          team_id,
          team as team_name,
          category,
          star_rating,
          points,
          auction_value,
          salary_per_match,
          status,
          season_id,
          updated_at
        FROM player_seasons
        WHERE team_id = ${teamId} AND season_id = ${seasonId}
        ORDER BY player_name ASC
      `;
    } else {
      playersResult = await sql`
        SELECT 
          id,
          player_id,
          player_name,
          team_id,
          team as team_name,
          category,
          star_rating,
          points,
          0 as auction_value,
          0 as salary_per_match,
          'active' as status,
          season_id,
          updated_at
        FROM realplayerstats
        WHERE team_id = ${teamId} AND season_id = ${seasonId}
        ORDER BY player_name ASC
      `;
    }

    let players = playersResult.map(player => ({
      id: player.id,
      player_id: player.player_id,
      name: player.player_name || '',
      team_id: player.team_id,
      team_name: player.team_name || teamName,
      category: player.category || '',
      star_rating: player.star_rating || 0,
      points: player.points || 0,
      auction_value: player.auction_value || 0,
      salary_per_match: player.salary_per_match || 0,
      status: player.status || '',
      season_id: player.season_id,
      updated_at: player.updated_at,
      photo_url: null, // Will be populated below
    }));

    // Fetch photo URLs from realplayers collection
    if (players.length > 0) {
      try {
        const playerIds = players.map(p => p.player_id).filter(Boolean);
        
        if (playerIds.length > 0) {
          const photoPlayers: any[] = [];
          
          // Firebase 'in' query has a limit of 30, so we need to batch
          const batchSize = 30;
          for (let i = 0; i < playerIds.length; i += batchSize) {
            const batch = playerIds.slice(i, i + batchSize);
            const snapshot = await adminDb
              .collection('realplayers')
              .where('player_id', 'in', batch)
              .get();
            
            snapshot.docs.forEach(doc => {
              const data = doc.data();
              photoPlayers.push({
                player_id: data.player_id,
                photo_url: data.photo_url,
              });
            });
          }
          
          // Create a map of player_id to photo_url
          const photoMap = new Map(
            photoPlayers.map(p => [p.player_id, p.photo_url])
          );
          
          // Merge photo URLs into player data
          players = players.map(player => ({
            ...player,
            photo_url: photoMap.get(player.player_id) || null,
          }));
          
          console.log(`📸 Fetched photo URLs for ${photoPlayers.length}/${playerIds.length} players`);
        }
      } catch (photoError) {
        console.error('Error fetching player photos:', photoError);
        // Continue without photos - they'll use fallback avatars
      }
    }

    console.log(`✅ Fetched ${players.length} tournament players for team ${teamId} (${teamName}) in season ${seasonId}`);

    return NextResponse.json({
      success: true,
      data: {
        players,
        count: players.length,
        teamInfo: {
          team_id: teamId,
          team_name: teamName,
          season_id: seasonId
        }
      },
    });

  } catch (error: any) {
    console.error('Error fetching tournament players:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch tournament players'
      },
      { status: 500 }
    );
  }
}