import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getReplacementInfo } from '@/lib/admin/player-replacement';

/**
 * GET /api/admin/player-replacement/info
 * Get details of a won player, their round, the team's bids, and replacement candidates
 * Restricted to committee admin
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['admin', 'committee', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('player_id');
    const seasonId = searchParams.get('season_id');
    const search = searchParams.get('search') || undefined;

    if (!playerId || !seasonId) {
      return NextResponse.json(
        { success: false, error: 'Missing required query parameters: player_id and season_id' },
        { status: 400 }
      );
    }

    const info = await getReplacementInfo(playerId, seasonId, search);
    return NextResponse.json({ success: true, data: info });
  } catch (err: any) {
    console.error('Error fetching player replacement info:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch replacement details' },
      { status: 500 }
    );
  }
}
