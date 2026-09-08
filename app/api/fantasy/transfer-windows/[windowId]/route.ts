import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * PUT /api/fantasy/transfer-windows/[windowId]
 * Update an existing transfer window
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ windowId: string }> }
) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized - Committee access required' },
        { status: 401 }
      );
    }

    const { windowId } = await params;
    if (!windowId) {
      return NextResponse.json(
        { error: 'window_id is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { window_name, opens_at, closes_at, start_round, end_round, window_type } = body;

    if (!window_name || !opens_at || !closes_at) {
      return NextResponse.json(
        { error: 'Missing required fields: window_name, opens_at, closes_at' },
        { status: 400 }
      );
    }

    const opensDate = new Date(opens_at);
    const closesDate = new Date(closes_at);
    if (closesDate <= opensDate) {
      return NextResponse.json(
        { error: 'closes_at must be after opens_at' },
        { status: 400 }
      );
    }

    const validWindowType = ['all', 'release', 'draft', 'swap'].includes(window_type) ? window_type : 'all';

    const result = await fantasySql`
      UPDATE fantasy_transfer_windows
      SET 
        window_name = ${window_name},
        opens_at = ${opens_at},
        closes_at = ${closes_at},
        start_time = ${opens_at},
        end_time = ${closes_at},
        start_round = ${start_round ? parseInt(start_round) : null},
        end_round = ${end_round ? parseInt(end_round) : null},
        window_type = ${validWindowType},
        updated_at = NOW()
      WHERE window_id = ${windowId}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Transfer window not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Transfer window updated successfully',
      window: result[0]
    });
  } catch (error: any) {
    console.error('Error updating transfer window:', error);
    return NextResponse.json(
      { error: 'Failed to update transfer window', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fantasy/transfer-windows/[windowId]
 * Delete a transfer window
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ windowId: string }> }
) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized - Committee access required' },
        { status: 401 }
      );
    }

    const { windowId } = await params;
    if (!windowId) {
      return NextResponse.json(
        { error: 'window_id is required' },
        { status: 400 }
      );
    }

    await fantasySql`
      DELETE FROM fantasy_transfer_windows
      WHERE window_id = ${windowId}
    `;

    return NextResponse.json({
      success: true,
      message: 'Transfer window deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting transfer window:', error);
    return NextResponse.json(
      { error: 'Failed to delete transfer window', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
