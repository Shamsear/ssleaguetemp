import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const auth = await verifyAuth(['team', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const seasonId = searchParams.get('seasonId');

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'Team ID is required' },
        { status: 400 }
      );
    }

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'Season ID is required' },
        { status: 400 }
      );
    }

    // Determine if this is a season that uses player_seasons (S16-S17 only)
    const isModernSeason = (season: string) => {
      const seasonNum = parseInt(season.replace(/\D/g, '')) || 0;
      return seasonNum === 16 || seasonNum === 17;
    };

    const sql = getTournamentDb();
    let realPlayersData;

    if (isModernSeason(seasonId)) {
      // Season 16-17 only: Query player_seasons table
      realPlayersData = await sql`
        SELECT 
          id,
          player_id,
          player_name,
          position,
          star_rating,
          auction_value,
          team_id,
          season_id
        FROM player_seasons 
        WHERE season_id = ${seasonId}
          AND team_id = ${teamId}
        ORDER BY player_name ASC
      `;
    } else {
      // Season 1-15 and S18+: Query realplayerstats table
      realPlayersData = await sql`
        SELECT 
          id,
          player_id,
          player_name,
          category,
          team_id,
          season_id
        FROM realplayerstats 
        WHERE season_id = ${seasonId}
          AND team_id = ${teamId}
        ORDER BY player_name ASC
      `;
    }

    // Transform data to a consistent format
    const players = realPlayersData.map((player: any) => ({
      id: player.id,
      player_id: player.player_id,
      name: player.player_name || 'Unknown',
      position: player.position || player.category || 'Unknown',
      photo_url: null, // Will be fetched from Firebase realplayers if needed
    }));

    console.log(`✅ Fetched ${players.length} real players for team ${teamId} in season ${seasonId}`);

    return NextResponse.json({
      success: true,
      data: players,
    });

  } catch (error: any) {
    console.error('Error fetching real players:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch real players' },
      { status: 500 }
    );
  }
}
