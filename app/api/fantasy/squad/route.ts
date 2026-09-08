import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getPlayerPhotosMap } from '@/lib/fantasy/photos';

/**
 * GET /api/fantasy/squad?team_id=xxx
 * Get complete squad data for a fantasy team
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const team_id = searchParams.get('team_id');

    if (!team_id) {
      return NextResponse.json(
        { error: 'Missing team_id parameter' },
        { status: 400 }
      );
    }

    // Fetch player photos map
    const photosMap = await getPlayerPhotosMap();

    // Get squad with all details
    const squad = await fantasySql`
      SELECT 
        fs.squad_id,
        fs.team_id,
        fs.league_id,
        fs.real_player_id,
        fs.player_name,
        COALESCE(fp.category, fs.position, 'Unknown') as category,
        fs.position,
        fs.real_team_name,
        fs.purchase_price,
        fs.current_value,
        fs.total_points,
        fs.is_captain,
        fs.is_vice_captain,
        fs.acquisition_type,
        fs.acquired_at
      FROM fantasy_squad fs
      LEFT JOIN fantasy_players fp ON (fs.real_player_id = fp.real_player_id AND fs.league_id = fp.league_id)
      WHERE fs.team_id = ${team_id}
      ORDER BY fs.acquired_at DESC
    `;

    return NextResponse.json({
      success: true,
      squad: squad.map((p: any) => ({
        squad_id: p.squad_id,
        real_player_id: p.real_player_id,
        player_name: p.player_name,
        category: p.category || 'Unknown',
        position: p.position || 'Unknown',
        real_team_name: p.real_team_name || 'Unknown',
        purchase_price: Number(p.purchase_price || 0),
        current_value: Number(p.current_value || 0),
        total_points: Number(p.total_points || 0),
        is_captain: p.is_captain || false,
        is_vice_captain: p.is_vice_captain || false,
        acquisition_type: p.acquisition_type,
        acquired_at: p.acquired_at,
        photo_url: photosMap[p.real_player_id] || null,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching squad:', error);
    return NextResponse.json(
      { error: 'Failed to fetch squad', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
