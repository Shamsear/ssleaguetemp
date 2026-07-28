import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { neon } from '@neondatabase/serverless';
import { adminDb } from '@/lib/firebase/admin';

// Use the correct auction database URL
const auctionSql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL!);

// GET - Fetch players for a specific team and season (both realplayers and footballplayers)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, message: 'Season ID is required' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    // 1. Fetch REALPLAYERS (tournament players) from correct database table
    let playerSeasons;
    if (isModern) {
      playerSeasons = await sql`
        SELECT 
          player_id,
          player_name,
          team,
          category,
          star_rating,
          points,
          registration_status
        FROM player_seasons
        WHERE team_id = ${teamId} 
          AND season_id = ${seasonId} 
          AND registration_status = 'active'
        ORDER BY player_name ASC
      `;
    } else {
      playerSeasons = await sql`
        SELECT 
          player_id,
          player_name,
          team,
          category,
          NULL as star_rating,
          points,
          matches_played,
          wins,
          draws,
          losses,
          goals_scored,
          assists,
          'active' as registration_status
        FROM realplayerstats
        WHERE team_id = ${teamId} 
          AND season_id = ${seasonId} 
        ORDER BY player_name ASC
      `;
    }

    // Fetch full realplayer details from Firebase if any exist
    let enrichedRealPlayers: any[] = [];
    if (playerSeasons.length > 0) {
      const playerIds = playerSeasons.map(ps => String(ps.player_id));
      const playerDocs = await adminDb.collection('realplayers')
        .where('player_id', 'in', playerIds)
        .get();
      
      // Create a map of player details by player_id (as string)
      const playerDetailsMap = new Map();
      playerDocs.docs.forEach(doc => {
        const data = doc.data();
        playerDetailsMap.set(String(data.player_id), data);
      });

      // Combine player_seasons data with Firebase player details
      enrichedRealPlayers = playerSeasons.map(ps => {
        const details = playerDetailsMap.get(String(ps.player_id)) || {};
        return {
          id: ps.player_id,
          player_id: ps.player_id,
          name: ps.player_name,
          type: 'realplayer',
          photo_url: details.photoUrl || details.photo_url || null,
          photo_position_x_circle: details.photo_position_x_circle ?? null,
          photo_position_y_circle: details.photo_position_y_circle ?? null,
          photo_scale_circle: details.photo_scale_circle ?? null,
          email: details.email || null,
          phone: details.phone || null,
          date_of_birth: details.dateOfBirth || details.date_of_birth || null,
          place: details.place || null,
          nationality: details.nationality || null,
          is_active: details.is_active !== false,
          is_available: details.is_available !== false,
          category: ps.category,
          star_rating: ps.star_rating,
          points: ps.points,
          status: ps.registration_status,
          matches_played: ps.matches_played || 0,
          wins: ps.wins || 0,
          draws: ps.draws || 0,
          losses: ps.losses || 0,
          goals_scored: ps.goals_scored || 0,
          assists: ps.assists || 0,
        };
      });
    }

    // 2. Fetch FOOTBALLPLAYERS (auction players) from team_players
    // Filter by contract period: show if current season is within contract range
    console.log(`[API] Fetching football players for team ${teamId}, season ${seasonId}`);
    console.log(`[API] Using database: ${process.env.NEON_AUCTION_DB_URL ? 'NEON_AUCTION_DB_URL' : 'NEON_DATABASE_URL'}`);
    
    const footballPlayers = await auctionSql`
      SELECT 
        tp.player_id,
        tp.purchase_price,
        tp.acquired_at,
        tp.round_id,
        tp.season_id,
        fp.name as player_name,
        fp.position,
        fp.position_group,
        fp.team_name as club,
        fp.overall_rating,
        fp.nationality,
        fp.age,
        fp.playing_style,
        fp.contract_start_season,
        fp.contract_end_season
      FROM team_players tp
      INNER JOIN footballplayers fp ON tp.player_id = fp.id
      WHERE tp.team_id = ${teamId}
        AND (
          tp.season_id = ${seasonId}
          OR (
            fp.contract_start_season <= ${seasonId} 
            AND fp.contract_end_season >= ${seasonId}
          )
        )
      ORDER BY tp.acquired_at DESC
    `;
    console.log(`[API] Found ${footballPlayers.length} football players with active contracts for season ${seasonId}`);
    if (footballPlayers.length > 0) {
      console.log(`[API] Sample player:`, {
        name: footballPlayers[0].player_name,
        contract_start: footballPlayers[0].contract_start_season,
        contract_end: footballPlayers[0].contract_end_season,
        current_season: seasonId
      });
    } else {
      console.log(`[API] No football players found. Checking team_players table...`);
      const allTeamPlayers = await auctionSql`
        SELECT tp.player_id, tp.team_id, tp.season_id, fp.contract_start_season, fp.contract_end_season
        FROM team_players tp
        LEFT JOIN footballplayers fp ON tp.player_id = fp.id
        WHERE tp.team_id = ${teamId}
        LIMIT 5
      `;
      console.log(`[API] Sample team_players records:`, allTeamPlayers);
    }

    const enrichedFootballPlayers = footballPlayers.map(fp => ({
      id: fp.player_id,
      player_id: fp.player_id,
      name: fp.player_name,
      type: 'footballplayer',
      position: fp.position,
      position_group: fp.position_group,
      club: fp.club,
      overall_rating: fp.overall_rating,
      nationality: fp.nationality,
      age: fp.age,
      playing_style: fp.playing_style,
      purchase_price: fp.purchase_price,
      acquired_at: fp.acquired_at,
      round_id: fp.round_id,
      contract_start_season: fp.contract_start_season,
      contract_end_season: fp.contract_end_season,
    }));

    // 3. Get current balance from Neon teams table (source of truth after finalization)
    const teamResult = await auctionSql`
      SELECT 
        football_budget, 
        football_spent, 
        football_players_count
      FROM teams
      WHERE id = ${teamId} AND season_id = ${seasonId}
      LIMIT 1
    `;

    const balance = teamResult.length > 0 ? {
      football_budget: teamResult[0].football_budget,
      football_spent: teamResult[0].football_spent,
      football_players_count: teamResult[0].football_players_count,
    } : null;

    // Combine both player types
    const allPlayers = [...enrichedRealPlayers, ...enrichedFootballPlayers];

    return NextResponse.json({
      success: true,
      data: allPlayers,
      realplayers: enrichedRealPlayers,
      footballplayers: enrichedFootballPlayers,
      balance,
    });
  } catch (error: any) {
    console.error('Error fetching team players:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch team players' },
      { status: 500 }
    );
  }
}
