/**
 * GET /api/categories - Returns all categories from Neon (with Firestore fallback)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

export async function GET() {
  try {
    if (isMainDbAvailable()) {
      try {
        const sql = getMainDb();
        const result = await sql`SELECT * FROM categories ORDER BY priority ASC, name ASC`;
        if (Array.isArray(result) && result.length > 0) {
          return NextResponse.json({ success: true, data: result });
        }
      } catch (dbErr: any) {
        console.warn('Neon categories query error, falling back to Firestore:', dbErr.message);
      }
    }

    // Fallback to Firestore if Neon fails or returns empty
    const snapshot = await adminDb.collection('categories').orderBy('priority', 'asc').get();
    const categories = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ success: true, data: categories });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/categories - Create a new category in Neon & Firestore
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color, priority, base_price, max_players } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: 'Category name is required' }, { status: 400 });
    }

    const id = `cat_${name.toLowerCase().replace(/\s+/g, '_')}`;

    const newCategory: any = {
      name: name.trim(),
      color: color || name.toLowerCase(),
      priority: parseInt(priority) || 1,
      base_price: parseFloat(base_price) || 0,
      max_players: parseInt(max_players) || 1,
      points_same_category: parseInt(body.points_same_category) || 8,
      points_one_level_diff: parseInt(body.points_one_level_diff) || 7,
      points_two_level_diff: parseInt(body.points_two_level_diff) || 6,
      points_three_level_diff: parseInt(body.points_three_level_diff) || 5,
      draw_same_category: parseInt(body.draw_same_category) || 4,
      draw_one_level_diff: parseInt(body.draw_one_level_diff) || 3,
      draw_two_level_diff: parseInt(body.draw_two_level_diff) || 2,
      draw_three_level_diff: parseInt(body.draw_three_level_diff) || 1,
      loss_same_category: parseInt(body.loss_same_category) || -3,
      loss_one_level_diff: parseInt(body.loss_one_level_diff) || -4,
      loss_two_level_diff: parseInt(body.loss_two_level_diff) || -5,
      loss_three_level_diff: parseInt(body.loss_three_level_diff) || -6,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Save to Firestore
    await adminDb.collection('categories').doc(id).set(newCategory);

    // Save to Neon Main DB
    if (isMainDbAvailable()) {
      try {
        const sql = getMainDb();
        await sql`
          INSERT INTO categories (
            id, name, color, priority, base_price, max_players,
            points_same_category, points_one_level_diff, points_two_level_diff, points_three_level_diff,
            draw_same_category, draw_one_level_diff, draw_two_level_diff, draw_three_level_diff,
            loss_same_category, loss_one_level_diff, loss_two_level_diff, loss_three_level_diff,
            updated_at
          ) VALUES (
            ${id}, ${newCategory.name}, ${newCategory.color}, ${newCategory.priority}, ${newCategory.base_price}, ${newCategory.max_players},
            ${newCategory.points_same_category}, ${newCategory.points_one_level_diff}, ${newCategory.points_two_level_diff}, ${newCategory.points_three_level_diff},
            ${newCategory.draw_same_category}, ${newCategory.draw_one_level_diff}, ${newCategory.draw_two_level_diff}, ${newCategory.draw_three_level_diff},
            ${newCategory.loss_same_category}, ${newCategory.loss_one_level_diff}, ${newCategory.loss_two_level_diff}, ${newCategory.loss_three_level_diff},
            NOW()
          ) ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            priority = EXCLUDED.priority,
            base_price = EXCLUDED.base_price,
            max_players = EXCLUDED.max_players,
            updated_at = NOW()
        `;
      } catch (neonErr: any) {
        console.warn('Neon category creation failed:', neonErr.message);
      }
    }

    return NextResponse.json({ success: true, data: { id, ...newCategory } });
  } catch (error: any) {
    console.error('Error creating category:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
