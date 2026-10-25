import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: seasonId } = await params;

    if (!seasonId) {
      return NextResponse.json(
        { success: false, message: 'Invalid season ID' },
        { status: 400 }
      );
    }

    const sql = getMainDb();
    const rows = await sql`SELECT * FROM seasons WHERE id = ${seasonId} LIMIT 1`;

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Season not found' },
        { status: 404 }
      );
    }

    const seasonData = rows[0];

    const responseData = {
      id: seasonData.id,
      name: seasonData.name,
      short_name: seasonData.short_name || '',
      is_active: seasonData.is_active || false,
      isActive: seasonData.is_active || false,
      status: seasonData.status || 'upcoming',
      registration_open: seasonData.registration_open || false,
      registrationOpen: seasonData.registration_open || false,
      total_teams: seasonData.total_teams || 0,
      totalTeams: seasonData.total_teams || 0,
      starting_balance: seasonData.starting_balance || 15000,
      type: seasonData.type || 'single',
      dollar_budget: seasonData.dollar_budget,
      euro_budget: seasonData.euro_budget,
      required_real_players: seasonData.required_real_players,
      max_football_players: seasonData.max_football_players,
      created_at: seasonData.created_at,
      updated_at: seasonData.updated_at,
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error('Error fetching season:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update a season (activate, complete, toggle registration, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: seasonId } = await params;
    const body = await request.json();
    const sql = getMainDb();

    // Map any camelCase keys to snake_case for DB columns
    const mappedBody: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === 'isActive') mappedBody['is_active'] = value;
      else if (key === 'registrationOpen') mappedBody['registration_open'] = value;
      else if (key === 'totalTeams') mappedBody['total_teams'] = value;
      else if (key === 'startDate') mappedBody['start_date'] = value;
      else if (key === 'endDate') mappedBody['end_date'] = value;
      else mappedBody[key] = value;
    }

    // If activating this season, deactivate all other seasons
    if (mappedBody.is_active === true || mappedBody.status === 'active') {
      await sql.query(
        "UPDATE seasons SET is_active = false, status = CASE WHEN status = 'active' THEN 'completed' ELSE status END WHERE id != $1",
        [seasonId]
      );
    }

    // Build dynamic SET clause
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(mappedBody)) {
      setClauses.push(`${key} = ${paramIdx++}`);
      values.push(value);
    }
    values.push(seasonId);

    await sql.query(
      `UPDATE seasons SET ${setClauses.join(', ')} WHERE id = ${paramIdx}`,
      values
    );

    return NextResponse.json({ success: true, message: 'Season updated' });
  } catch (error: any) {
    console.error('Error updating season:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update season' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a season
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: seasonId } = await params;
    const sql = getMainDb();
    await sql`DELETE FROM seasons WHERE id = ${seasonId}`;
    return NextResponse.json({ success: true, message: 'Season deleted' });
  } catch (error: any) {
    console.error('Error deleting season:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete season' },
      { status: 500 }
    );
  }
}
