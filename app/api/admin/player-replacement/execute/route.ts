import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { executePlayerReplacement } from '@/lib/admin/player-replacement';

/**
 * POST /api/admin/player-replacement/execute
 * Execute the transactional replacement of a won player with a new candidate player
 * Restricted to committee admin
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['admin', 'committee', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      original_player_id, 
      replacement_player_id, 
      team_id, 
      season_id, 
      new_price 
    } = body;

    if (!original_player_id || !replacement_player_id || !team_id || !season_id || new_price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: original_player_id, replacement_player_id, team_id, season_id, and new_price' },
        { status: 400 }
      );
    }

    const adminUser = {
      uid: auth.userId || auth.uid || 'admin',
      email: (auth as any).email || 'admin@ssleague.com',
      username: (auth as any).username || 'Committee Admin'
    };

    const result = await executePlayerReplacement({
      originalPlayerId: original_player_id,
      replacementPlayerId: replacement_player_id,
      teamId: team_id,
      seasonId: season_id,
      newPrice: Number(new_price),
      adminUser
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Error executing player replacement:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to execute player replacement' },
      { status: 500 }
    );
  }
}
