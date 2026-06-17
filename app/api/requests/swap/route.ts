import { NextRequest, NextResponse } from 'next/server';
import { 
  createSwapRequest, 
  getPendingSwapRequests, 
  getTeamSwapRequests 
} from '@/lib/neon/roster-requests';
import { getWindowById, getTeamRequestCountForWindow } from '@/lib/neon/transfer-windows';

/**
 * POST /api/requests/swap
 * Submit a new swap request
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season_id, requesting_team_id, target_team_id, players, window_id } = body;
    
    if (!season_id || !requesting_team_id || !target_team_id || !players || !Array.isArray(players) || players.length < 2 || !window_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields or invalid players array (window_id is required)' },
        { status: 400 }
      );
    }
    
    // Validate window
    const window = await getWindowById(window_id);
    if (!window || window.status !== 'open' || window.type !== 'swap' || window.season_id !== season_id) {
      return NextResponse.json(
        { success: false, error: 'Invalid or closed transfer window' },
        { status: 403 }
      );
    }
    
    // Validate limits
    if (window.max_requests > 0) {
      const currentCount = await getTeamRequestCountForWindow(requesting_team_id, window_id, 'swap');
      if (currentCount >= window.max_requests) {
        return NextResponse.json(
          { success: false, error: `You have reached your limit of ${window.max_requests} swaps for this window.` },
          { status: 403 }
        );
      }
    }
    
    const req = await createSwapRequest(body);
    
    return NextResponse.json({ success: true, data: req });
  } catch (error: any) {
    console.error('Error creating swap request:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create request' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/requests/swap
 * Get pending swap requests, or a team's requests
 * ?team_id=XYZ&season_id=123 (fetch team's requests)
 * ?season_id=123 (fetch all pending requests for a season)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const team_id = searchParams.get('team_id');
    const season_id = searchParams.get('season_id');
    
    let requests;
    
    if (team_id && season_id) {
      requests = await getTeamSwapRequests(team_id, season_id);
    } else {
      requests = await getPendingSwapRequests(season_id || undefined);
    }
    
    return NextResponse.json({ success: true, data: requests });
  } catch (error: any) {
    console.error('Error fetching swap requests:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch requests' },
      { status: 500 }
    );
  }
}
