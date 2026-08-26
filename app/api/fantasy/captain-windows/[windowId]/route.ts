import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fantasy/captain-windows/[windowId]
 * Get details of a specific captain window
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ windowId: string }> }
) {
  try {
    const { windowId } = await params;

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

    const leagueId = window[0].league_id;

    // Get all teams in this league
    const teams = await sql`
      SELECT team_id, team_name, owner_name 
      FROM fantasy_teams 
      WHERE league_id = ${leagueId}
      ORDER BY team_name ASC
    `;

    // Get selections in this window
    const selections = await sql`
      SELECT 
        team_id,
        captain_player_id,
        vice_captain_player_id,
        changed_at
      FROM fantasy_captain_history
      WHERE league_id = ${leagueId}
        AND window_id = ${windowId}
    `;

    // Fetch player names for mapping
    const players = await sql`
      SELECT real_player_id, player_name
      FROM fantasy_players
      WHERE league_id = ${leagueId}
    `;
    const playerMap = new Map(players.map((p: any) => [p.real_player_id, p.player_name]));

    const teamSelections = teams.map((t: any) => {
      const sel = selections.find((s: any) => s.team_id === t.team_id);
      return {
        team_id: t.team_id,
        team_name: t.team_name,
        owner_name: t.owner_name,
        has_set: !!sel,
        captain_name: sel ? (playerMap.get(sel.captain_player_id) || sel.captain_player_id) : 'Not Set',
        vice_captain_name: sel ? (playerMap.get(sel.vice_captain_player_id) || sel.vice_captain_player_id) : 'Not Set',
        changed_at: sel ? sel.changed_at : null
      };
    });

    return NextResponse.json({
      success: true,
      window: window[0],
      selections: teamSelections
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
  { params }: { params: Promise<{ windowId: string }> }
) {
  try {
    const { windowId } = await params;
    const body = await request.json();
    const {
      window_status,
      opens_at,
      closes_at,
      notes,
      round_number,
      round_name,
      start_round,
      end_round
    } = body;

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
    if (round_number !== undefined) {
      updates.push('round_number = $' + (values.length + 1));
      values.push(round_number ? parseInt(round_number) : null);
    }
    if (round_name !== undefined) {
      updates.push('round_name = $' + (values.length + 1));
      values.push(round_name);
    }
    if (start_round !== undefined) {
      updates.push('start_round = $' + (values.length + 1));
      values.push(start_round ? parseInt(start_round) : null);
    }
    if (end_round !== undefined) {
      updates.push('end_round = $' + (values.length + 1));
      values.push(end_round ? parseInt(end_round) : null);
    }

    // Always update updated_at
    updates.push('updated_at = NOW()');

    if (updates.length === 1) { // Only updated_at
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Append windowId as the last parameter
    values.push(windowId);
    const query = `
      UPDATE fantasy_captain_windows
      SET ${updates.join(', ')}
      WHERE window_id = $${values.length}
      RETURNING *
    `;

    const updatedResult = await sql.query(query, values);
    const updatedRow = updatedResult.rows ? updatedResult.rows[0] : updatedResult[0];

    return NextResponse.json({
      success: true,
      window: updatedRow,
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
  { params }: { params: Promise<{ windowId: string }> }
) {
  try {
    const { windowId } = await params;

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
