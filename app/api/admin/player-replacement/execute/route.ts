import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { executePlayerReplacement, executeRandomPlayerReplacement } from '@/lib/admin/player-replacement';

/**
 * POST /api/admin/player-replacement/execute
 * Execute the transactional replacement of a won player with a new candidate player
 * Supports random position group draw (non-selectable) and manual candidate replacement
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
      new_price,
      mode
    } = body;

    const adminUser = {
      uid: auth.userId || auth.uid || 'admin',
      email: (auth as any).email || 'admin@ssleague.com',
      username: (auth as any).username || 'Committee Admin'
    };

    // Mode: Random Position Group Replacement (non-selectable draw)
    if (mode === 'random' || !replacement_player_id) {
      if (!original_player_id || !team_id || !season_id) {
        return NextResponse.json(
          { success: false, error: 'Missing required parameters: original_player_id, team_id, and season_id' },
          { status: 400 }
        );
      }

      const result = await executeRandomPlayerReplacement({
        originalPlayerId: original_player_id,
        teamId: team_id,
        seasonId: season_id,
        adminUser
      });

      return NextResponse.json(result);
    }

    // Manual candidate replacement (legacy / fallback)
    if (!original_player_id || !replacement_player_id || !team_id || !season_id || new_price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: original_player_id, replacement_player_id, team_id, season_id, and new_price' },
        { status: 400 }
      );
    }

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
