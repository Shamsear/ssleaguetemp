import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/captain-windows
 * List all captain windows for a league
 * 
 * Query params:
 * - league_id: Required
 * - status: Optional filter (pending, open, closed, locked)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const statusFilter = searchParams.get('status');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'league_id is required' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    let windows;
    if (statusFilter) {
      windows = await sql`
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
          created_at,
          updated_at,
          notes,
          start_round,
          end_round
        FROM fantasy_captain_windows
        WHERE league_id = ${leagueId}
          AND window_status = ${statusFilter}
        ORDER BY round_number ASC, created_at DESC
      `;
    } else {
      windows = await sql`
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
          created_at,
          updated_at,
          notes,
          start_round,
          end_round
        FROM fantasy_captain_windows
        WHERE league_id = ${leagueId}
        ORDER BY round_number ASC, created_at DESC
      `;
    }

    return NextResponse.json({
      success: true,
      windows,
      total: windows.length
    });
  } catch (error: any) {
    console.error('Error fetching captain windows:', error);
    return NextResponse.json(
      { error: 'Failed to fetch captain windows', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fantasy/captain-windows
 * Create a new captain selection window
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      league_id,
      round_id,
      round_number,
      round_name,
      opens_at,
      closes_at,
      notes,
      created_by_user_id,
      start_round,
      end_round
    } = body;

    // Validation
    if (!league_id || !round_id || !opens_at || !closes_at || start_round === undefined || end_round === undefined) {
      return NextResponse.json(
        { error: 'league_id, round_id, opens_at, closes_at, start_round, and end_round are required' },
        { status: 400 }
      );
    }

    // Validate dates
    const opensDate = new Date(opens_at);
    const closesDate = new Date(closes_at);

    if (isNaN(opensDate.getTime()) || isNaN(closesDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format for opens_at or closes_at' },
        { status: 400 }
      );
    }

    if (closesDate <= opensDate) {
      return NextResponse.json(
        { error: 'closes_at must be after opens_at' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // Check if window already exists for this round
    const existing = await sql`
      SELECT window_id FROM fantasy_captain_windows
      WHERE league_id = ${league_id}
        AND round_id = ${round_id}
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Captain window already exists for this round' },
        { status: 409 }
      );
    }

    // Get total teams count for this league
    const teamsResult = await sql`
      SELECT COUNT(*) as count
      FROM fantasy_teams
      WHERE league_id = ${league_id}
    `;
    const totalTeams = parseInt(teamsResult[0]?.count || '0');

    // Generate window_id
    const windowId = `cw_${league_id}_${round_id}_${Date.now()}`;

    // Create window
    const newWindow = await sql`
      INSERT INTO fantasy_captain_windows (
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
        notes,
        start_round,
        end_round
      ) VALUES (
        ${windowId},
        ${league_id},
        ${round_id},
        ${round_number || null},
        ${round_name || null},
        'pending',
        ${opens_at},
        ${closes_at},
        ${totalTeams},
        0,
        ${created_by_user_id || null},
        ${notes || null},
        ${start_round},
        ${end_round}
      )
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      window: newWindow[0],
      message: 'Captain window created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating captain window:', error);
    return NextResponse.json(
      { error: 'Failed to create captain window', details: error.message },
      { status: 500 }
    );
  }
}
