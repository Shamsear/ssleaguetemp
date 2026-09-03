/**
 * GET /api/categories - Returns all categories from Neon
 * POST /api/categories - Create/update/delete categories
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';

export async function GET() {
  try {
    if (!isMainDbAvailable()) {
      return NextResponse.json({ success: false, error: 'Neon not configured' }, { status: 500 });
    }
    const sql = getMainDb();
    const result = await sql`SELECT * FROM categories ORDER BY priority ASC, name ASC`;
    return NextResponse.json({ success: true, data: Array.isArray(result) ? result : [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
