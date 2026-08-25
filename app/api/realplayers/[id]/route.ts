import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

/**
 * PATCH /api/realplayers/[id]
 * Update a realplayer's fields
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
      photo_url: 'photo_url',
      photo_file_id: 'photo_file_id',
      photo_position_x: 'photo_position_x',
      photo_position_y: 'photo_position_y',
      photo_scale: 'photo_scale',
      name: 'name',
      display_name: 'display_name',
      is_active: 'is_active',
      is_available: 'is_available',
      notes: 'notes',
      raw_data: 'raw_data',
    };

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(body)) {
      const col = allowedFields[key];
      if (col && value !== undefined) {
        updates.push(`${col} = $${idx++}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    await sql.query(
      `UPDATE realplayers SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating realplayer:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
