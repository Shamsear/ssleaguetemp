/**
 * Categories — Neon is the ONLY source for reads AND writes.
 * Firebase removed for this collection.
 */

import { getMainDb } from '../neon/main-config';

export interface Category {
  id: string;
  name: string;
  color: 'red' | 'blue' | 'black' | 'white';
  priority: number;
  points_same_category: number;
  points_one_level_diff: number;
  points_two_level_diff: number;
  points_three_level_diff: number;
  draw_same_category: number;
  draw_one_level_diff: number;
  draw_two_level_diff: number;
  draw_three_level_diff: number;
  loss_same_category: number;
  loss_one_level_diff: number;
  loss_two_level_diff: number;
  loss_three_level_diff: number;
  created_at: Date;
  updated_at?: Date;
}

export interface CreateCategoryData {
  name: string;
  color: 'red' | 'blue' | 'black' | 'white';
  priority: number;
  points_same_category: number;
  points_one_level_diff: number;
  points_two_level_diff: number;
  points_three_level_diff: number;
  draw_same_category: number;
  draw_one_level_diff: number;
  draw_two_level_diff: number;
  draw_three_level_diff: number;
  loss_same_category: number;
  loss_one_level_diff: number;
  loss_two_level_diff: number;
  loss_three_level_diff: number;
}

export interface UpdateCategoryData {
  name?: string;
  color?: 'red' | 'blue' | 'black' | 'white';
  priority?: number;
  points_same_category?: number;
  points_one_level_diff?: number;
  points_two_level_diff?: number;
  points_three_level_diff?: number;
  draw_same_category?: number;
  draw_one_level_diff?: number;
  draw_two_level_diff?: number;
  draw_three_level_diff?: number;
  loss_same_category?: number;
  loss_one_level_diff?: number;
  loss_two_level_diff?: number;
  loss_three_level_diff?: number;
}

const generateCategoryId = (name: string): string => {
  return `cat_${name.toLowerCase().replace(/\s+/g, '_')}`;
};

// ============================
// READ FUNCTIONS — Neon only
// ============================

export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const sql = getMainDb();
    const result = await sql`SELECT * FROM categories ORDER BY sort_order ASC, name ASC`;
    return result.map(mapCategoryRow);
  } catch (error) {
    console.error('Error getting all categories:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get categories');
  }
};

export const getCategoryById = async (categoryId: string): Promise<Category | null> => {
  try {
    const sql = getMainDb();
    const result = await sql`SELECT * FROM categories WHERE id = ${categoryId} LIMIT 1`;
    if (result.length === 0) return null;
    return mapCategoryRow(result[0]);
  } catch (error) {
    console.error('Error getting category by ID:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get category');
  }
};

export const getCategoryByName = async (name: string): Promise<Category | null> => {
  try {
    const sql = getMainDb();
    const result = await sql`SELECT * FROM categories WHERE name = ${name} LIMIT 1`;
    if (result.length === 0) return null;
    return mapCategoryRow(result[0]);
  } catch (error) {
    console.error('Error getting category by name:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get category');
  }
};

// ============================
// WRITE FUNCTIONS — Neon only
// ============================

export const createCategory = async (categoryData: CreateCategoryData): Promise<Category> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();

    if (categoryData.priority < 1 || categoryData.priority > 4) {
      throw new Error('Priority must be between 1 and 4');
    }

    const existing = await getCategoryByName(categoryData.name);
    if (existing) throw new Error(`Category with name "${categoryData.name}" already exists`);

    const priorityCheck = await sql`SELECT id FROM categories WHERE priority = ${categoryData.priority} LIMIT 1`;
    if (priorityCheck.length > 0) {
      throw new Error(`Priority ${categoryData.priority} is already assigned to another category`);
    }

    const categoryId = generateCategoryId(categoryData.name);
    await sql`
      INSERT INTO categories (
        id, name, color, priority, sort_order,
        points_same_category, points_one_level_diff, points_two_level_diff, points_three_level_diff,
        draw_same_category, draw_one_level_diff, draw_two_level_diff, draw_three_level_diff,
        loss_same_category, loss_one_level_diff, loss_two_level_diff, loss_three_level_diff,
        raw_data, created_at, updated_at
      ) VALUES (
        ${categoryId}, ${categoryData.name}, ${categoryData.color}, ${categoryData.priority}, ${categoryData.priority},
        ${categoryData.points_same_category}, ${categoryData.points_one_level_diff},
        ${categoryData.points_two_level_diff}, ${categoryData.points_three_level_diff},
        ${categoryData.draw_same_category}, ${categoryData.draw_one_level_diff},
        ${categoryData.draw_two_level_diff}, ${categoryData.draw_three_level_diff},
        ${categoryData.loss_same_category}, ${categoryData.loss_one_level_diff},
        ${categoryData.loss_two_level_diff}, ${categoryData.loss_three_level_diff},
        ${JSON.stringify(categoryData)}, ${now}, ${now}
      )
    `;
    const created = await getCategoryById(categoryId);
    if (!created) throw new Error('Failed to fetch created category');
    return created;
  } catch (error) {
    console.error('Error creating category:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to create category');
  }
};

export const updateCategory = async (categoryId: string, updates: UpdateCategoryData): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();
    const existing = await getCategoryById(categoryId);
    if (!existing) throw new Error('Category not found');

    if (updates.priority !== undefined) {
      if (updates.priority < 1 || updates.priority > 4) throw new Error('Priority must be between 1 and 4');
      const conflict = await sql`SELECT id FROM categories WHERE priority = ${updates.priority} AND id != ${categoryId} LIMIT 1`;
      if (conflict.length > 0) throw new Error(`Priority ${updates.priority} is already assigned to another category`);
    }

    if (updates.name && updates.name !== existing.name) {
      const nameConflict = await getCategoryByName(updates.name);
      if (nameConflict && nameConflict.id !== categoryId) {
        throw new Error(`Category with name "${updates.name}" already exists`);
      }
    }

    const setClauses: string[] = ['updated_at = $1'];
    const values: any[] = [now];
    let idx = 2;
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (setClauses.length > 1) {
      await sql.query(`UPDATE categories SET ${setClauses.join(', ')} WHERE id = $${idx}`, [...values, categoryId]);
    }
  } catch (error) {
    console.error('Error updating category:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update category');
  }
};

export const deleteCategory = async (categoryId: string): Promise<void> => {
  try {
    const sql = getMainDb();
    const players = await sql`SELECT id FROM realplayers WHERE category_id = ${categoryId} LIMIT 1`;
    if (players.length > 0) {
      throw new Error('Cannot delete category. Players are assigned to this category. Reassign them first.');
    }
    await sql`DELETE FROM categories WHERE id = ${categoryId}`;
  } catch (error) {
    console.error('Error deleting category:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete category');
  }
};

export const calculateMatchPoints = async (
  playerCategoryId: string,
  opponentCategoryId: string,
  result: 'win' | 'draw' | 'loss'
): Promise<number> => {
  const playerCategory = await getCategoryById(playerCategoryId);
  const opponentCategory = await getCategoryById(opponentCategoryId);
  if (!playerCategory || !opponentCategory) throw new Error('Invalid category IDs');

  const levelDiff = Math.abs(playerCategory.priority - opponentCategory.priority);
  if (result === 'win') {
    if (levelDiff === 0) return playerCategory.points_same_category;
    if (levelDiff === 1) return playerCategory.points_one_level_diff;
    if (levelDiff === 2) return playerCategory.points_two_level_diff;
    return playerCategory.points_three_level_diff;
  } else if (result === 'draw') {
    if (levelDiff === 0) return playerCategory.draw_same_category;
    if (levelDiff === 1) return playerCategory.draw_one_level_diff;
    if (levelDiff === 2) return playerCategory.draw_two_level_diff;
    return playerCategory.draw_three_level_diff;
  } else {
    if (levelDiff === 0) return playerCategory.loss_same_category;
    if (levelDiff === 1) return playerCategory.loss_one_level_diff;
    if (levelDiff === 2) return playerCategory.loss_two_level_diff;
    return playerCategory.loss_three_level_diff;
  }
};

export const initializeDefaultCategories = async (): Promise<void> => {
  const defaults: CreateCategoryData[] = [
    { name: 'Red', color: 'red', priority: 1, points_same_category: 8, points_one_level_diff: 7, points_two_level_diff: 6, points_three_level_diff: 5, draw_same_category: 4, draw_one_level_diff: 3, draw_two_level_diff: 3, draw_three_level_diff: 2, loss_same_category: 1, loss_one_level_diff: 1, loss_two_level_diff: 1, loss_three_level_diff: 0 },
    { name: 'Blue', color: 'blue', priority: 2, points_same_category: 8, points_one_level_diff: 7, points_two_level_diff: 6, points_three_level_diff: 5, draw_same_category: 4, draw_one_level_diff: 3, draw_two_level_diff: 3, draw_three_level_diff: 2, loss_same_category: 1, loss_one_level_diff: 1, loss_two_level_diff: 1, loss_three_level_diff: 0 },
    { name: 'Black', color: 'black', priority: 3, points_same_category: 8, points_one_level_diff: 7, points_two_level_diff: 6, points_three_level_diff: 5, draw_same_category: 4, draw_one_level_diff: 3, draw_two_level_diff: 3, draw_three_level_diff: 2, loss_same_category: 1, loss_one_level_diff: 1, loss_two_level_diff: 1, loss_three_level_diff: 0 },
    { name: 'White', color: 'white', priority: 4, points_same_category: 8, points_one_level_diff: 7, points_two_level_diff: 6, points_three_level_diff: 5, draw_same_category: 4, draw_one_level_diff: 3, draw_two_level_diff: 3, draw_three_level_diff: 2, loss_same_category: 1, loss_one_level_diff: 1, loss_two_level_diff: 1, loss_three_level_diff: 0 },
  ];
  for (const cat of defaults) {
    const existing = await getCategoryByName(cat.name);
    if (!existing) await createCategory(cat);
  }
};

// ============================
// Mapping
// ============================

function mapCategoryRow(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    priority: row.priority,
    points_same_category: row.points_same_category || 0,
    points_one_level_diff: row.points_one_level_diff || 0,
    points_two_level_diff: row.points_two_level_diff || 0,
    points_three_level_diff: row.points_three_level_diff || 0,
    draw_same_category: row.draw_same_category || 0,
    draw_one_level_diff: row.draw_one_level_diff || 0,
    draw_two_level_diff: row.draw_two_level_diff || 0,
    draw_three_level_diff: row.draw_three_level_diff || 0,
    loss_same_category: row.loss_same_category || 0,
    loss_one_level_diff: row.loss_one_level_diff || 0,
    loss_two_level_diff: row.loss_two_level_diff || 0,
    loss_three_level_diff: row.loss_three_level_diff || 0,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
  } as Category;
}
