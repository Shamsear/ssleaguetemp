import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

// Ensure the temp table exists (idempotent)
async function ensureTable(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS temp_category_overrides (
      player_id  TEXT NOT NULL,
      season_id  TEXT NOT NULL,
      category   TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (player_id, season_id)
    )
  `;
}

// GET  ?seasonId=SSPSLS18  →  { success, overrides: [{player_id, category}] }
export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const seasonId = new URL(request.url).searchParams.get('seasonId');
    if (!seasonId) {
      return NextResponse.json({ success: false, error: 'seasonId required' }, { status: 400 });
    }

    await ensureTable(sql);

    const rows = await sql`
      SELECT player_id, category
      FROM temp_category_overrides
      WHERE season_id = ${seasonId}
    `;

    return NextResponse.json({ success: true, overrides: rows });
  } catch (error: any) {
    console.error('[temp-overrides GET]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST  { seasonId, overrides: [{player_id, category}] }
// Upserts the full override set for a season (replaces existing for those player_ids)
export async function POST(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const { seasonId, overrides } = await request.json();

    if (!seasonId || !Array.isArray(overrides)) {
      return NextResponse.json({ success: false, error: 'seasonId and overrides[] required' }, { status: 400 });
    }

    await ensureTable(sql);

    if (overrides.length === 0) {
      // Nothing to upsert — just ensure table exists
      return NextResponse.json({ success: true, count: 0 });
    }

    // Upsert each override (ON CONFLICT replaces category + updated_at)
    for (const { player_id, category } of overrides) {
      await sql`
        INSERT INTO temp_category_overrides (player_id, season_id, category, updated_at)
        VALUES (${player_id}, ${seasonId}, ${category}, NOW())
        ON CONFLICT (player_id, season_id)
        DO UPDATE SET category = EXCLUDED.category, updated_at = NOW()
      `;
    }

    return NextResponse.json({ success: true, count: overrides.length });
  } catch (error: any) {
    console.error('[temp-overrides POST]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE  ?seasonId=SSPSLS18  →  clears ALL temp overrides for that season
// Also accepts optional ?playerId=xxx to remove a single player's override
export async function DELETE(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const params = new URL(request.url).searchParams;
    const seasonId = params.get('seasonId');
    const playerId = params.get('playerId');

    if (!seasonId) {
      return NextResponse.json({ success: false, error: 'seasonId required' }, { status: 400 });
    }

    await ensureTable(sql);

    if (playerId) {
      // Remove a single player's override
      await sql`
        DELETE FROM temp_category_overrides
        WHERE season_id = ${seasonId} AND player_id = ${playerId}
      `;
    } else {
      // Remove all overrides for this season (called after Apply Categories)
      await sql`
        DELETE FROM temp_category_overrides
        WHERE season_id = ${seasonId}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[temp-overrides DELETE]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
