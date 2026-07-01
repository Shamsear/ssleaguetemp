import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    
    // Fetch all player_seasons with their registration info
    const playerSeasons = await sql`
      SELECT 
        ps.id,
        ps.player_id,
        ps.team_id,
        ps.season_id,
        ps.player_name,
        ps.category,
        ps.star_rating,
        ps.points,
        ps.registration_status,
        ps.created_at,
        ps.updated_at
      FROM player_seasons ps
      
      UNION ALL
      
      SELECT 
        rps.id,
        rps.player_id,
        rps.team_id,
        rps.season_id,
        rps.player_name,
        rps.category,
        rps.star_rating,
        rps.points,
        'active' as registration_status,
        rps.created_at,
        rps.updated_at
      FROM realplayerstats rps
      
      ORDER BY created_at DESC
    `;
    
    return NextResponse.json({
      success: true,
      data: playerSeasons,
    });
  } catch (error) {
    console.error('Error fetching player seasons:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch player seasons',
    }, { status: 500 });
  }
}
