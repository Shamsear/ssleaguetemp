import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

/**
 * PATCH /api/teams/[id]
 * Update team fields (logo, colors, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const sql = getMainDb();

    const allowedFields: Record<string, string> = {
      logo_url: 'logo_url',
      teamLogo: 'logo_url',
      logoUrl: 'logo_url',
      team_color: 'team_color',
      team_name: 'team_name',
      is_active: 'is_active',
      isActive: 'is_active',
    };

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(body)) {
      const col = allowedFields[key];
      if (col && value !== undefined) {
        updates.push(`${col} = $${idx++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    await sql.query(
      `UPDATE teams SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating team:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sql = getMainDb();
    await sql`DELETE FROM teams WHERE id = ${id}`;
    return NextResponse.json({ success: true, message: 'Team deleted' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
