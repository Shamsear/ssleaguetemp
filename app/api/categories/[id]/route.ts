import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (isMainDbAvailable()) {
      try {
        const sql = getMainDb();
        const rows = await sql`SELECT * FROM categories WHERE id = ${id} OR name ILIKE ${id}`;
        if (rows && rows.length > 0) {
          return NextResponse.json({ success: true, data: rows[0] });
        }
      } catch (neonErr: any) {
        console.warn('Neon category fetch failed:', neonErr.message);
      }
    }

    const categoryDoc = await adminDb.collection('categories').doc(id).get();
    if (categoryDoc.exists) {
      return NextResponse.json({
        success: true,
        data: { id: categoryDoc.id, ...categoryDoc.data() },
      });
    }

    return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error fetching category:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/categories/[id]
 * Update a category
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Validate color if provided
    if (body.color) {
      const validColors = ['red', 'blue', 'black', 'white'];
      if (!validColors.includes(body.color)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid color. Must be one of: ${validColors.join(', ')}`,
          },
          { status: 400 }
        );
      }
    }
    
    // Validate priority if provided
    if (body.priority !== undefined) {
      const priority = parseInt(body.priority);
      if (isNaN(priority) || priority < 1 || priority > 4) {
        return NextResponse.json(
          {
            success: false,
            error: 'Priority must be a number between 1 and 4',
          },
          { status: 400 }
        );
      }
    }
    
    // Validate points if provided
    const pointFields = [
      'points_same_category',
      'points_one_level_diff',
      'points_two_level_diff',
      'points_three_level_diff',
      'draw_same_category',
      'draw_one_level_diff',
      'draw_two_level_diff',
      'draw_three_level_diff',
      'loss_same_category',
      'loss_one_level_diff',
      'loss_two_level_diff',
      'loss_three_level_diff',
    ];
    
    for (const field of pointFields) {
      if (body[field] !== undefined) {
        const value = parseInt(body[field]);
        if (isNaN(value) || value < -20 || value > 20) {
          return NextResponse.json(
            {
              success: false,
              error: `${field} must be a number between -20 and 20`,
            },
            { status: 400 }
          );
        }
      }
    }
    
    // Build update object
    const updates: any = {};
    
    if (body.name) updates.name = body.name.trim();
    if (body.color) updates.color = body.color;
    if (body.priority !== undefined) updates.priority = parseInt(body.priority);
    if (body.base_price !== undefined) updates.base_price = parseInt(body.base_price) || 0;
    if (body.max_players !== undefined) updates.max_players = parseInt(body.max_players) || 1;
    
    // Add point updates
    for (const field of pointFields) {
      if (body[field] !== undefined) {
        updates[field] = parseInt(body[field]);
      }
    }
    
    updates.updated_at = new Date();
    
    await adminDb.collection('categories').doc(id).update(updates);
    
    if (isMainDbAvailable()) {
      try {
        const sql = getMainDb();
        if (updates.name) await sql`UPDATE categories SET name = ${updates.name}, updated_at = NOW() WHERE id = ${id}`;
        if (updates.color) await sql`UPDATE categories SET color = ${updates.color}, updated_at = NOW() WHERE id = ${id}`;
        if (updates.priority !== undefined) await sql`UPDATE categories SET priority = ${updates.priority}, updated_at = NOW() WHERE id = ${id}`;
        if (updates.base_price !== undefined) await sql`UPDATE categories SET base_price = ${updates.base_price}, updated_at = NOW() WHERE id = ${id}`;
        if (updates.max_players !== undefined) await sql`UPDATE categories SET max_players = ${updates.max_players}, updated_at = NOW() WHERE id = ${id}`;
        for (const field of pointFields) {
          if (updates[field] !== undefined) {
            await sql`UPDATE categories SET ${sql(field)} = ${updates[field]}, updated_at = NOW() WHERE id = ${id}`;
          }
        }
      } catch (neonErr: any) {
        console.warn('Neon category update error:', neonErr.message);
      }
    }

    // Fetch updated category
    const updatedDoc = await adminDb.collection('categories').doc(id).get();
    const updatedCategory = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    };
    
    return NextResponse.json({
      success: true,
      data: updatedCategory,
      message: 'Category updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating category:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update category',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/categories/[id]
 * Delete a category
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await adminDb.collection('categories').doc(id).delete();
    
    if (isMainDbAvailable()) {
      try {
        const sql = getMainDb();
        await sql`DELETE FROM categories WHERE id = ${id}`;
      } catch (neonErr: any) {
        console.warn('Neon category delete error:', neonErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete category',
      },
      { status: 500 }
    );
  }
}

