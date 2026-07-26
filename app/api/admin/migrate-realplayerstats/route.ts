import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * POST /api/admin/migrate-realplayerstats
 * One-time migration:
 *   - DROP star_rating from realplayerstats
 *   - ADD base_price INT DEFAULT 0
 *   - ADD price INT DEFAULT 0
 */
export async function POST(request: NextRequest) {
  try {
    const sql = getTournamentDb();

    await sql`ALTER TABLE realplayerstats DROP COLUMN IF EXISTS star_rating`;
    await sql`ALTER TABLE realplayerstats ADD COLUMN IF NOT EXISTS base_price INT DEFAULT 0`;
    await sql`ALTER TABLE realplayerstats ADD COLUMN IF NOT EXISTS price INT DEFAULT 0`;

    // Verify
    const cols = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'realplayerstats'
      ORDER BY ordinal_position
    `;

    return NextResponse.json({
      success: true,
      message: 'Migration complete: star_rating dropped, base_price and price columns added to realplayerstats',
      columns: cols.map((c: any) => ({ name: c.column_name, type: c.data_type, default: c.column_default })),
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}
