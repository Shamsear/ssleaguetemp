-- =====================================================
-- Fantasy Draft Rounds Migration
-- Run this against the FANTASY Neon database
-- =====================================================

-- Step 1: Add missing columns to fantasy_leagues if they don't exist
ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS category_settings JSONB;
ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS draft_opens_at TIMESTAMP;
ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS draft_closes_at TIMESTAMP;
ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS draft_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS min_squad_size INTEGER DEFAULT 5;
ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Step 2: Create fantasy_draft_rounds table
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
);

CREATE INDEX IF NOT EXISTS idx_fantasy_draft_rounds_league ON fantasy_draft_rounds(league_id);

-- Step 3: Migrate existing data from fantasy_leagues into fantasy_draft_rounds
-- Uses a DO block to iterate over leagues and their category_settings slots
DO $$
DECLARE
    league_rec RECORD;
    slot JSONB;
    cs JSONB;
    slots JSONB;
    active_slot_idx INTEGER;
    slot_idx INTEGER;
    slot_name TEXT;
    round_status TEXT;
BEGIN
    FOR league_rec IN
        SELECT league_id, draft_status, draft_opens_at, draft_closes_at, category_settings
        FROM fantasy_leagues
    LOOP
        -- Skip if no category_settings
        IF league_rec.category_settings IS NULL THEN
            CONTINUE;
        END IF;

        -- Parse category_settings (might be JSONB or text-encoded JSON)
        BEGIN
            cs := league_rec.category_settings::jsonb;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;

        slots := cs->'slots';
        IF slots IS NULL THEN
            CONTINUE;
        END IF;

        active_slot_idx := (cs->>'active_slot_index')::INTEGER;

        FOR slot IN SELECT * FROM jsonb_array_elements(slots)
        LOOP
            slot_idx  := (slot->>'slot_index')::INTEGER;
            slot_name := slot->>'name';

            -- Determine status for this slot
            IF league_rec.draft_status = 'active' AND active_slot_idx = slot_idx THEN
                round_status := 'active';
            ELSIF league_rec.draft_status = 'completed' THEN
                round_status := 'completed';
            ELSE
                round_status := 'pending';
            END IF;

            INSERT INTO fantasy_draft_rounds (league_id, slot_index, slot_name, opens_at, closes_at, status)
            VALUES (
                league_rec.league_id,
                slot_idx,
                slot_name,
                league_rec.draft_opens_at,
                league_rec.draft_closes_at,
                round_status
            )
            ON CONFLICT (league_id, slot_index) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- Step 4: Add round_id column to fantasy_draft_bids
ALTER TABLE fantasy_draft_bids ADD COLUMN IF NOT EXISTS round_id INTEGER;

-- Step 5: Backfill round_id on existing bids
UPDATE fantasy_draft_bids b
SET round_id = r.id
FROM fantasy_draft_rounds r
WHERE b.league_id = r.league_id
  AND b.slot_index = r.slot_index
  AND b.round_id IS NULL;

-- Step 6: Add auto-update trigger for fantasy_draft_rounds
CREATE OR REPLACE FUNCTION update_fantasy_draft_rounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_fantasy_draft_rounds_updated_at ON fantasy_draft_rounds;
CREATE TRIGGER update_fantasy_draft_rounds_updated_at BEFORE UPDATE
    ON fantasy_draft_rounds FOR EACH ROW
    EXECUTE FUNCTION update_fantasy_draft_rounds_updated_at();

-- Step 7: Drop old timing columns from fantasy_leagues (no longer needed)
ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS draft_opens_at;
ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS draft_closes_at;
ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS active_slot_index;

-- Done!
