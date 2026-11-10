import { NextRequest, NextResponse } from 'next/server';
import {
  resetAllPositionGroups,
  resetPositionGroups,
  dividePositionGroups,
  swapPlayerPositionGroup
} from '@/lib/neon/players';
import { verifyAuth } from '@/lib/auth-helper';

export const maxDuration = 30;

/**
 * DELETE /api/players/position-groups
 * Query parameters:
 *   ?all=true             -> Reset all position groups across entire database
 *   ?position=CB          -> Reset position groups for a specific position
 */
export async function DELETE(request: NextRequest) {
  try {
    try {
      const auth = await verifyAuth(['admin', 'committee_admin', 'super_admin'], request, true);
      if (auth.authenticated) {
        console.log(`[Position Groups API] DELETE by ${auth.userId} (${auth.role})`);
      }
    } catch (authErr) {
      console.warn('[Position Groups API] Auth warning on DELETE:', authErr);
    }

    const { searchParams } = new URL(request.url);
    const isAll = searchParams.get('all') === 'true';
    const position = searchParams.get('position');

    // Also support JSON body if sent with DELETE
    let bodyAll = false;
    let bodyPosition: string | null = null;
    try {
      const body = await request.json();
      bodyAll = !!body?.all;
      bodyPosition = body?.position || null;
    } catch {
      // Body is optional
    }

    if (isAll || bodyAll) {
      const count = await resetAllPositionGroups();
      console.log(`[Position Groups API] Reset all position groups: ${count} players cleared`);
      return NextResponse.json({
        success: true,
        message: `Successfully cleared position groups for all ${count} players across the registry.`,
        count
      });
    }

    const targetPosition = position || bodyPosition;
    if (targetPosition) {
      const count = await resetPositionGroups(targetPosition);
      console.log(`[Position Groups API] Reset position groups for ${targetPosition}: ${count} players cleared`);
      return NextResponse.json({
        success: true,
        message: `Successfully cleared position groups for ${targetPosition} (${count} players cleared).`,
        count,
        position: targetPosition.toUpperCase()
      });
    }

    return NextResponse.json(
      { success: false, error: 'Specify ?all=true or ?position=<position>' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in DELETE /api/players/position-groups:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/players/position-groups
 * Body:
 *   { action: 'divide', position: 'CB' }
 *   { action: 'reset', all: true }
 *   { action: 'reset', position: 'CB' }
 *   { action: 'swap', playerId: '...', newGroup: 'CB-2' }
 */
export async function POST(request: NextRequest) {
  try {
    try {
      const auth = await verifyAuth(['admin', 'committee_admin', 'super_admin'], request, true);
      if (auth.authenticated) {
        console.log(`[Position Groups API] POST by ${auth.userId} (${auth.role})`);
      }
    } catch (authErr) {
      console.warn('[Position Groups API] Auth warning on POST:', authErr);
    }

    const body = await request.json();
    const { action, position, all: isAll, playerId, newGroup } = body || {};

    if (action === 'divide') {
      if (!position) {
        return NextResponse.json(
          { success: false, error: 'Position is required for divide action' },
          { status: 400 }
        );
      }

      const result = await dividePositionGroups(position);
      console.log(`[Position Groups API] Divided ${position}: ${result.total} players (${result.group1} in group 1, ${result.group2} in group 2)`);
      return NextResponse.json({
        success: true,
        message: `Successfully divided ${result.total} ${position} players into 2 balanced groups!`,
        data: result
      });
    }

    if (action === 'reset') {
      if (isAll) {
        const count = await resetAllPositionGroups();
        return NextResponse.json({
          success: true,
          message: `Successfully cleared position groups for all ${count} players across the registry.`,
          count
        });
      }

      if (position) {
        const count = await resetPositionGroups(position);
        return NextResponse.json({
          success: true,
          message: `Successfully cleared position groups for ${position}.`,
          count,
          position: position.toUpperCase()
        });
      }

      return NextResponse.json(
        { success: false, error: 'Specify position or all: true for reset action' },
        { status: 400 }
      );
    }

    if (action === 'swap') {
      if (!playerId) {
        return NextResponse.json(
          { success: false, error: 'playerId is required for swap action' },
          { status: 400 }
        );
      }

      const player = await swapPlayerPositionGroup(playerId, newGroup || null);
      if (!player) {
        return NextResponse.json(
          { success: false, error: 'Player not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Updated player group`,
        data: player
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/players/position-groups:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/players/position-groups
 * Body: { playerId: string, position_group: string | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    try {
      const auth = await verifyAuth(['admin', 'committee_admin', 'super_admin'], request, true);
      if (auth.authenticated) {
        console.log(`[Position Groups API] PATCH by ${auth.userId} (${auth.role})`);
      }
    } catch (authErr) {
      console.warn('[Position Groups API] Auth warning on PATCH:', authErr);
    }

    const body = await request.json();
    const { playerId, position_group } = body || {};

    if (!playerId) {
      return NextResponse.json(
        { success: false, error: 'playerId is required' },
        { status: 400 }
      );
    }

    const player = await swapPlayerPositionGroup(playerId, position_group !== undefined ? position_group : null);
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Position group updated successfully',
      data: player
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/players/position-groups:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
