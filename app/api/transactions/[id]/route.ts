import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

/**
 * PATCH /api/transactions/[id]
 * Update a transaction's fields
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
      amount: 'amount',
      balance_after: 'balance_after',
      description: 'description',
      status: 'status',
      notes: 'notes',
      category: 'category',
      type: 'type',
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
      `UPDATE transactions SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating transaction:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/transactions/[id]
 * Delete a transaction
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sql = getMainDb();

    await sql`DELETE FROM transactions WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
