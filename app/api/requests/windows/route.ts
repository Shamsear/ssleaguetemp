import { NextRequest, NextResponse } from 'next/server';
import { getOpenWindows, getTeamRequestCountForWindow } from '@/lib/neon/transfer-windows';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id');
    const teamId = searchParams.get('team_id');
    
    if (!seasonId || !teamId) {
      return NextResponse.json({ success: false, error: 'Missing season_id or team_id' }, { status: 400 });
    }
    
    // Get all open windows for this season
    const openWindows = await getOpenWindows(seasonId);
    
    // For each window, calculate how many requests the team has made
    const windowsWithUsage = await Promise.all(
      openWindows.map(async (window) => {
        let usage = 0;
        if (window.max_requests > 0) {
          usage = await getTeamRequestCountForWindow(teamId, window.id, window.type as 'release' | 'swap');
        }
        
        return {
          ...window,
          usage,
          remaining: window.max_requests > 0 ? Math.max(0, window.max_requests - usage) : null,
          isLimitReached: window.max_requests > 0 && usage >= window.max_requests
        };
      })
    );
    
    return NextResponse.json({ success: true, data: windowsWithUsage });
  } catch (error: any) {
    console.error('Error fetching windows:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
