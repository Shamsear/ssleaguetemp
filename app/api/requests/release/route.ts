import { NextRequest, NextResponse } from 'next/server';
import { 
  createReleaseRequest, 
  getPendingReleaseRequests, 
  getTeamReleaseRequests 
} from '@/lib/neon/roster-requests';
import { getWindowById, getTeamRequestCountForWindow } from '@/lib/neon/transfer-windows';

/**
 * POST /api/requests/release
 * Submit a new release request
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id, season_id, player_id, player_name, player_type, refund_amount, window_id } = body;
    
    if (!team_id || !season_id || !player_id || !player_name || !player_type || refund_amount === undefined || !window_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (window_id is required)' },
        { status: 400 }
      );
    }
    
    // Validate window
    const window = await getWindowById(window_id);
    if (!window || window.status !== 'open' || window.type !== 'release' || window.season_id !== season_id) {
      return NextResponse.json(
        { success: false, error: 'Invalid or closed transfer window' },
        { status: 403 }
      );
    }
    
    // Validate limits
    if (window.max_requests > 0) {
      const currentCount = await getTeamRequestCountForWindow(team_id, window_id, 'release');
      if (currentCount >= window.max_requests) {
        return NextResponse.json(
          { success: false, error: `You have reached your limit of ${window.max_requests} releases for this window.` },
          { status: 403 }
        );
      }
    }
    
    const req = await createReleaseRequest(body);
    
    return NextResponse.json({ success: true, data: req });
  } catch (error: any) {
    console.error('Error creating release request:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create request' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/requests/release
 * Get pending release requests, or a team's requests
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
      requests = await getTeamReleaseRequests(team_id, season_id);
    } else {
      requests = await getPendingReleaseRequests(season_id || undefined);
    }
    
    return NextResponse.json({ success: true, data: requests });
  } catch (error: any) {
    console.error('Error fetching release requests:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch requests' },
      { status: 500 }
    );
  }
}
