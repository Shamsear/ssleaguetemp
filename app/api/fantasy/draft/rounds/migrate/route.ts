import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/draft/rounds/migrate
 * Creates fantasy_draft_rounds table and migrates existing data.
 * Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT).
 */
export async function POST() {
  try {
    // 0. Ensure columns exist (safe to run repeatedly)
    await fantasySql`ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS category_settings JSONB`;
    await fantasySql`ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS draft_opens_at TIMESTAMP`;
    await fantasySql`ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS draft_closes_at TIMESTAMP`;
    await fantasySql`ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS draft_status VARCHAR(20) DEFAULT 'pending'`;

    // 1. Create table
    await fantasySql`
      CREATE TABLE IF NOT EXISTS fantasy_draft_rounds (
        id              SERIAL PRIMARY KEY,
        league_id       VARCHAR(50) NOT NULL,
        slot_index      INTEGER NOT NULL,
        slot_name       VARCHAR(100),
        opens_at        TIMESTAMPTZ,
        closes_at       TIMESTAMPTZ,
        status          VARCHAR(20) DEFAULT 'pending',
        created_at      TIMESTAMP DEFAULT NOW(),
        finalization_mode VARCHAR(20) DEFAULT 'auto',
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(league_id, slot_index)
      )
    `;

    // Upgrade TIMESTAMP columns to TIMESTAMPTZ if needed
    try { await fantasySql`ALTER TABLE fantasy_draft_rounds ALTER COLUMN opens_at TYPE TIMESTAMPTZ USING opens_at AT TIME ZONE 'UTC'`; } catch {}
    try { await fantasySql`ALTER TABLE fantasy_draft_rounds ALTER COLUMN closes_at TYPE TIMESTAMPTZ USING closes_at AT TIME ZONE 'UTC'`; } catch {}
    try { await fantasySql`ALTER TABLE fantasy_draft_rounds ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'`; } catch {}
    try { await fantasySql`ALTER TABLE fantasy_draft_rounds ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`; } catch {}

    // Add finalization_mode column if missing
    try { await fantasySql`ALTER TABLE fantasy_draft_rounds ADD COLUMN IF NOT EXISTS finalization_mode VARCHAR(20) DEFAULT 'auto'`; } catch {}

    // 6. Create preview results table for manual finalization
    await fantasySql`
      CREATE TABLE IF NOT EXISTS fantasy_draft_preview (
        id              SERIAL PRIMARY KEY,
        league_id       VARCHAR(50) NOT NULL,
        slot_index      INTEGER NOT NULL,
        preview_data    JSONB NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(league_id, slot_index)
      )
    `;

    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_draft_preview_league
        ON fantasy_draft_preview(league_id)
    `;

    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_draft_rounds_league
        ON fantasy_draft_rounds(league_id)
    `;

    // 2. Migrate existing data from fantasy_leagues
    const leagues = await fantasySql`
      SELECT league_id, draft_status, draft_opens_at, draft_closes_at, category_settings
      FROM fantasy_leagues
    `;

    let migrated = 0;
    for (const league of leagues) {
      if (!league.category_settings) continue;

      const cs = typeof league.category_settings === 'string'
        ? JSON.parse(league.category_settings)
        : league.category_settings;
      const slots = cs?.slots || [];
      const activeSlotIdx = Number(cs?.active_slot_index) || null;

      for (const slot of slots) {
        const slotIdx = Number(slot.slot_index);
        const slotStatus =
          league.draft_status === 'active' && activeSlotIdx === slotIdx ? 'active'
          : league.draft_status === 'completed' ? 'completed'
          : 'pending';

        await fantasySql`
          INSERT INTO fantasy_draft_rounds (league_id, slot_index, slot_name, opens_at, closes_at, status)
          VALUES (
            ${league.league_id}, ${slotIdx}, ${slot.name || 'Slot ' + slotIdx},
            ${league.draft_opens_at}, ${league.draft_closes_at}, ${slotStatus}
          )
          ON CONFLICT (league_id, slot_index) DO NOTHING
        `;
        migrated++;
      }
    }

    // 3. Add round_id column to fantasy_draft_bids if missing
    await fantasySql`
      ALTER TABLE fantasy_draft_bids
      ADD COLUMN IF NOT EXISTS round_id INTEGER
    `;

    // 4. Backfill round_id on existing bids by matching league_id + slot_index
    await fantasySql`
      UPDATE fantasy_draft_bids b
      SET round_id = r.id
      FROM fantasy_draft_rounds r
      WHERE b.league_id = r.league_id
        AND b.slot_index = r.slot_index
        AND b.round_id IS NULL
    `;

    // 5. Drop old timing columns from fantasy_leagues
    try { await fantasySql`ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS draft_opens_at`; } catch {}
    try { await fantasySql`ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS draft_closes_at`; } catch {}

    return NextResponse.json({
      success: true,
      message: `Migration complete. ${migrated} draft rounds created. Bids linked to rounds. Old columns dropped.`,
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
