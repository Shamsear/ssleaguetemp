import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season_id = searchParams.get('season_id') || 'SSPSLS16';

    const sql = getTournamentDb();

    const seasonNum = parseInt(season_id.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    let players;
    if (isModern) {
      players = await sql`
        SELECT 
          id,
          player_id,
          player_name,
          season_id,
          team,
          points,
          base_points,
          matches_played,
          goals_scored,
          goals_conceded,
          (goals_scored - goals_conceded) as goal_difference,
          wins,
          draws,
          losses,
          clean_sheets,
          assists,
          auction_value,
          star_rating,
          salary_per_match,
          category
        FROM player_seasons
        WHERE season_id = ${season_id}
        ORDER BY points DESC, goal_difference DESC, goals_scored DESC
      `;
    } else {
      players = await sql`
        SELECT 
          id,
          player_id,
          player_name,
          season_id,
          team,
          points,
          0 as base_points,
          base_price,
          price,
          matches_played,
          goals_scored,
          goals_conceded,
          (goals_scored - goals_conceded) as goal_difference,
          wins,
          draws,
          losses,
          clean_sheets,
          assists,
          category
        FROM realplayerstats
        WHERE season_id = ${season_id}
        ORDER BY points DESC, goal_difference DESC, goals_scored DESC
      `;
    }

    // Fetch Firestore realplayers collection to map the category
    const firebasePlayersSnapshot = await adminDb.collection('realplayers').get();
    const firebasePlayersMap = new Map();
    firebasePlayersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      firebasePlayersMap.set(String(data.player_id), data);
    });

    const enrichedPlayers = players.map((p: any) => {
      const firebaseData = firebasePlayersMap.get(String(p.player_id)) || {};
      return {
        ...p,
        category: firebaseData.category || firebaseData.category_name || p.category || 'BRONZE',
        photo_url: firebaseData.photo_url || firebaseData.photoUrl || null,
        photo_position_x_circle: firebaseData.photo_position_x_circle ?? null,
        photo_position_y_circle: firebaseData.photo_position_y_circle ?? null,
        photo_scale_circle: firebaseData.photo_scale_circle ?? null,
        photo_position_x_square: firebaseData.photo_position_x_square ?? null,
        photo_position_y_square: firebaseData.photo_position_y_square ?? null,
        photo_scale_square: firebaseData.photo_scale_square ?? null,
      };
    });

    // Debug logging
    console.log('[Committee Player Stats API] Season:', season_id);
    console.log('[Committee Player Stats API] Total players:', enrichedPlayers.length);
    if (enrichedPlayers.length > 0) {
      console.log('[Committee Player Stats API] First player:', {
        player_id: enrichedPlayers[0].player_id,
        player_name: enrichedPlayers[0].player_name,
        points: enrichedPlayers[0].points,
        base_points: enrichedPlayers[0].base_points,
        category: enrichedPlayers[0].category
      });
    }

    return NextResponse.json({ players: enrichedPlayers });
  } catch (error: any) {
    console.error('Error fetching player stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player stats' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      player_id,
      points,
      base_points,
      matches_played,
      goals_scored,
      goals_conceded,
      wins,
      draws,
      losses,
      clean_sheets,
      assists
    } = body;

    if (!player_id) {
      return NextResponse.json(
        { error: 'player_id is required' },
        { status: 400 }
      );
    }


    const sql = getTournamentDb();

    // Calculate star rating from points
    function calculateStarRating(pts: number): number {
      if (pts >= 350) return 10;
      if (pts >= 300) return 9;
      if (pts >= 250) return 8;
      if (pts >= 210) return 7;
      if (pts >= 175) return 6;
      if (pts >= 145) return 5;
      if (pts >= 120) return 4;
      return 3;
    }

    const seasonNum = parseInt(player_id.split('_')[1]?.replace(/\D/g, '') || '0');
    const isModern = seasonNum === 16 || seasonNum === 17;

    // Enforce minimum points of 100 for modern seasons (S16/17)
    const validatedPoints = isModern ? Math.max(100, points || 100) : (points || 0);

    // Get current player data to check auction value
    let currentData;
    if (isModern) {
      currentData = await sql`
        SELECT auction_value, star_rating, salary_per_match
        FROM player_seasons
        WHERE id = ${player_id}
      `;
    } else {
      currentData = await sql`
        SELECT base_price, price
        FROM realplayerstats
        WHERE id = ${player_id}
      `;
    }

    if (currentData.length === 0) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const auctionValue = currentData[0].auction_value || 0;
    const oldStarRating = currentData[0].star_rating || 3;
    const oldSalary = parseFloat(currentData[0].salary_per_match) || 0;

    // Calculate new star rating based on validated points
    const newStarRating = calculateStarRating(validatedPoints);

    // Calculate new salary if star rating changed
    // Formula: (auction_value / 100) * star_rating / 10
    const newSalary = (auctionValue / 100) * newStarRating / 10;

    // Log the changes
    console.log('[Committee Player Stats API] Updating player:', player_id);
    console.log('  Points:', validatedPoints, points !== validatedPoints ? `(enforced minimum from ${points})` : '');
    console.log('  Star Rating:', oldStarRating, '→', newStarRating, newStarRating !== oldStarRating ? '(CHANGED)' : '');
    console.log('  Salary:', oldSalary.toFixed(2), '→', newSalary.toFixed(2), newStarRating !== oldStarRating ? '(RECALCULATED)' : '');

    if (isModern) {
      await sql`
        UPDATE player_seasons
        SET
          points = ${validatedPoints},
          star_rating = ${newStarRating},
          salary_per_match = ${newSalary},
          base_points = ${base_points},
          matches_played = ${matches_played},
          goals_scored = ${goals_scored},
          goals_conceded = ${goals_conceded},
          wins = ${wins},
          draws = ${draws},
          losses = ${losses},
          clean_sheets = ${clean_sheets},
          assists = ${assists},
          updated_at = NOW()
        WHERE id = ${player_id}
      `;
    } else {
      // S18+: update match stats only; base_price is managed via category assignment
      await sql`
        UPDATE realplayerstats
        SET
          points = ${validatedPoints},
          matches_played = ${matches_played},
          goals_scored = ${goals_scored},
          goals_conceded = ${goals_conceded},
          wins = ${wins},
          draws = ${draws},
          losses = ${losses},
          clean_sheets = ${clean_sheets},
          assists = ${assists},
          updated_at = NOW()
        WHERE id = ${player_id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating player stats:', error);
    return NextResponse.json(
      { error: 'Failed to update player stats' },
      { status: 500 }
    );
  }
}
