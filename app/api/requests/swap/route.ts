import { NextRequest, NextResponse } from 'next/server';
import { 
  createSwapRequest, 
  getPendingSwapRequests, 
  getTeamSwapRequests 
} from '@/lib/neon/roster-requests';
import { getWindowById, getTeamRequestCountForWindow } from '@/lib/neon/transfer-windows';
import { sendNotification } from '@/lib/notifications/send-notification';

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

    // Validate if any of the players are already involved in pending swap or release requests
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const playerIds = players.map(p => p.player_id);

    // 1. Check pending releases
    const pendingReleases = await sql`
      SELECT player_name FROM release_requests 
      WHERE player_id = ANY(${playerIds}) 
      AND status = 'pending' 
      AND season_id = ${season_id}
    `;

    if (pendingReleases.length > 0) {
      const names = pendingReleases.map(r => r.player_name).join(', ');
      return NextResponse.json(
        { success: false, error: `Cannot submit request. The following player(s) have pending release requests: ${names}` },
        { status: 400 }
      );
    }

    // 2. Check pending swaps
    const pendingSwaps = await sql`
      SELECT srp.player_name FROM swap_request_players srp
      JOIN swap_requests sr ON srp.swap_request_id = sr.id
      WHERE srp.player_id = ANY(${playerIds})
      AND sr.status = 'pending'
      AND sr.season_id = ${season_id}
    `;

    if (pendingSwaps.length > 0) {
      const names = pendingSwaps.map(s => s.player_name).join(', ');
      return NextResponse.json(
        { success: false, error: `Cannot submit request. The following player(s) are already involved in pending swap requests: ${names}` },
        { status: 400 }
      );
    }
    
    const req = await createSwapRequest(body);

    // Notify committee admins
    try {
      const p1Name = players[0]?.player_name || 'Player 1';
      const p2Name = players[1]?.player_name || 'Player 2';
      await sendNotification({
        title: `📥 New Swap/Trade Request`,
        body: `Trade proposal submitted: ${p1Name} ↔ ${p2Name}.`,
        url: `/dashboard/committee/requests`
      }, { isCommittee: true });
    } catch (err: any) {
      console.error('Failed to notify admins of swap request:', err);
    }
    
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
    const window_id = searchParams.get('window_id');
    
    let requests;
    
    if (window_id && window_id !== 'all') {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.NEON_DATABASE_URL!);
      const windowIdNum = parseInt(window_id);
      
      if (team_id) {
        requests = await sql`
          SELECT * FROM swap_requests 
          WHERE (requesting_team_id = ${team_id} OR target_team_id = ${team_id}) 
          AND window_id = ${windowIdNum} 
          ORDER BY submitted_at DESC
        `;
      } else {
        requests = await sql`
          SELECT * FROM swap_requests 
          WHERE status = 'pending' 
          AND window_id = ${windowIdNum} 
          ORDER BY submitted_at DESC
        `;
      }
      
      // Populate players
      for (const req of requests) {
        req.players = await sql`SELECT * FROM swap_request_players WHERE swap_request_id = ${req.id}`;
      }
    } else if (team_id && season_id) {
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
