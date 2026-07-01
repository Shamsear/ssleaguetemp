import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'season_id is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Fetching roster for:', { teamId, seasonId });

    const sql = getTournamentDb();
    
    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    // Get all active players for this team in this season from correct database table
    let players;
    if (isModern) {
      players = await sql`
        SELECT 
          player_id,
          player_name as name,
          category,
          CASE 
            WHEN registration_status = 'active' THEN true
            ELSE false
          END as is_active
        FROM player_seasons
        WHERE team_id = ${teamId}
          AND season_id = ${seasonId}
          AND registration_status = 'active'
        ORDER BY player_name
      `;
    } else {
      players = await sql`
        SELECT 
          player_id,
          player_name as name,
          category,
          true as is_active
        FROM realplayerstats
        WHERE team_id = ${teamId}
          AND season_id = ${seasonId}
        ORDER BY player_name
      `;
    }

    console.log('✅ Found players:', players.length);
    if (players.length === 0) {
      console.log('⚠️ No players found. Checking all records for this team/season...');
      let allPlayers;
      if (isModern) {
        allPlayers = await sql`
          SELECT COUNT(*) as total, registration_status
          FROM player_seasons
          WHERE team_id = ${teamId} AND season_id = ${seasonId}
          GROUP BY registration_status
        `;
      } else {
        allPlayers = await sql`
          SELECT COUNT(*) as total, 'active' as registration_status
          FROM realplayerstats
          WHERE team_id = ${teamId} AND season_id = ${seasonId}
        `;
      }
      console.log('📊 All player records:', allPlayers);
    }

    return NextResponse.json({
      success: true,
      players: players
    });
  } catch (error: any) {
    console.error('Error fetching team roster:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch roster' },
      { status: 500 }
    );
  }
}
