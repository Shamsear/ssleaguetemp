import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/draft/rounds/migrate
 * Creates fantasy_draft_rounds table and migrates existing data.
 * Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT).
 */
export async function POST() {
  try {
    // 1. Create table
    await fantasySql`
      CREATE TABLE IF NOT EXISTS fantasy_draft_rounds (
        id              SERIAL PRIMARY KEY,
        league_id       VARCHAR(50) NOT NULL,
        slot_index      INTEGER NOT NULL,
        slot_name       VARCHAR(100),
        opens_at        TIMESTAMP,
        closes_at       TIMESTAMP,
        status          VARCHAR(20) DEFAULT 'pending',
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(league_id, slot_index)
      )
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
            ${league.league_id}, ${slotIdx}, ${slot.name},
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
      ADD COLUMN IF NOT EXISTS round_id INTEGER REFERENCES fantasy_draft_rounds(id)
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

    return NextResponse.json({
      success: true,
      message: `Migration complete. ${migrated} draft rounds created. Bids linked to rounds.`,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
