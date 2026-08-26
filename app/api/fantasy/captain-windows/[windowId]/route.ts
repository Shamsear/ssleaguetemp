import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/captain-windows/[windowId]
 * Get details of a specific captain window
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { windowId: string } }
) {
  try {
    const { windowId } = params;

    const sql = getFantasyDb();

    const window = await sql`
      SELECT 
        window_id,
        league_id,
        round_id,
        round_number,
        round_name,
        window_status,
        opens_at,
        closes_at,
        total_teams,
        teams_with_captain_set,
        created_by_user_id,
        created_at,
        updated_at,
        notes,
        start_round,
        end_round
      FROM fantasy_captain_windows
      WHERE window_id = ${windowId}
    `;

    if (window.length === 0) {
      return NextResponse.json(
        { error: 'Captain window not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      window: window[0]
    });
  } catch (error: any) {
    console.error('Error fetching captain window:', error);
    return NextResponse.json(
      { error: 'Failed to fetch captain window', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/fantasy/captain-windows/[windowId]
 * Update captain window (typically to change status)
 * 
 * Body:
 * - window_status: Optional ('pending', 'open', 'closed', 'locked')
 * - opens_at: Optional
 * - closes_at: Optional
 * - notes: Optional
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { windowId: string } }
) {
  try {
    const { windowId } = params;
    const body = await request.json();
    const { window_status, opens_at, closes_at, notes } = body;

    // Validate status if provided
    if (window_status && !['pending', 'open', 'closed', 'locked'].includes(window_status)) {
      return NextResponse.json(
        { error: 'Invalid window_status. Must be: pending, open, closed, or locked' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Check if window exists
    const existing = await sql`
      SELECT * FROM fantasy_captain_windows
      WHERE window_id = ${windowId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Captain window not found' },
        { status: 404 }
      );
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (window_status !== undefined) {
      updates.push('window_status = $' + (values.length + 1));
      values.push(window_status);
    }
    if (opens_at !== undefined) {
      updates.push('opens_at = $' + (values.length + 1));
      values.push(opens_at);
    }
    if (closes_at !== undefined) {
      updates.push('closes_at = $' + (values.length + 1));
      values.push(closes_at);
    }
    if (notes !== undefined) {
      updates.push('notes = $' + (values.length + 1));
      values.push(notes);
    }

    // Always update updated_at
    updates.push('updated_at = NOW()');

    if (updates.length === 1) { // Only updated_at
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update using direct SQL with COALESCE for optional fields
    const updated = await sql`
      UPDATE fantasy_captain_windows
      SET 
        window_status = COALESCE(${window_status}, window_status),
        opens_at = COALESCE(${opens_at}, opens_at),
        closes_at = COALESCE(${closes_at}, closes_at),
        notes = COALESCE(${notes}, notes),
        updated_at = NOW()
      WHERE window_id = ${windowId}
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      window: updated[0],
      message: 'Captain window updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating captain window:', error);
    return NextResponse.json(
      { error: 'Failed to update captain window', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fantasy/captain-windows/[windowId]
 * Delete a captain window (only if no teams have set captains yet)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { windowId: string } }
) {
  try {
    const { windowId } = params;

    const sql = getFantasyDb();

    // Check if window exists and if teams have set captains
    const window = await sql`
      SELECT teams_with_captain_set FROM fantasy_captain_windows
      WHERE window_id = ${windowId}
    `;

    if (window.length === 0) {
      return NextResponse.json(
        { error: 'Captain window not found' },
        { status: 404 }
      );
    }

    if (window[0].teams_with_captain_set > 0) {
      return NextResponse.json(
        { error: 'Cannot delete window - teams have already set captains' },
        { status: 409 }
      );
    }

    // Delete window
    await sql`
      DELETE FROM fantasy_captain_windows
      WHERE window_id = ${windowId}
    `;

    return NextResponse.json({
      success: true,
      message: 'Captain window deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting captain window:', error);
    return NextResponse.json(
      { error: 'Failed to delete captain window', details: error.message },
      { status: 500 }
    );
  }
}
