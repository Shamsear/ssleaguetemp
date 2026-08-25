-- =====================================================
-- Fantasy Draft Rounds: Per-slot independent timing
-- Replaces the single draft_opens_at/draft_closes_at
-- on fantasy_leagues with per-slot round records.
-- =====================================================

CREATE TABLE IF NOT EXISTS fantasy_draft_rounds (
    id              SERIAL PRIMARY KEY,
    league_id       VARCHAR(50) NOT NULL,
    slot_index      INTEGER NOT NULL,
    slot_name       VARCHAR(100),
    opens_at        TIMESTAMP,
    closes_at       TIMESTAMP,
    status          VARCHAR(20) DEFAULT 'pending',  -- pending | active | closed | completed
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(league_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_draft_rounds_league
    ON fantasy_draft_rounds(league_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_draft_rounds_status
    ON fantasy_draft_rounds(status);

-- Migrate existing data: create round rows from category_settings slots
-- and the league-level draft_opens_at / draft_closes_at / draft_status
DO $$
DECLARE
    rec         RECORD;
    slot        JSONB;
    slot_idx    INTEGER;
    slot_name   TEXT;
    league_rec  RECORD;
BEGIN
    FOR league_rec IN
        SELECT league_id, draft_status, draft_opens_at, draft_closes_at, category_settings
        FROM fantasy_leagues
    LOOP
        IF league_rec.category_settings IS NULL THEN
            CONTINUE;
        END IF;

        -- Parse category_settings if stored as text
        DECLARE
            cs JSONB := CASE WHEN jsonb_typeof(league_rec.category_settings::jsonb) = 'string'
                             THEN league_rec.category_settings::jsonb::text::jsonb
                             ELSE league_rec.category_settings::jsonb END;
            slots JSONB := cs->'slots';
        BEGIN
            IF slots IS NULL THEN CONTINUE; END IF;

            FOR slot IN SELECT * FROM jsonb_array_elements(slots)
            LOOP
                slot_idx  := (slot->>'slot_index')::INTEGER;
                slot_name := slot->>'name';

                INSERT INTO fantasy_draft_rounds (league_id, slot_index, slot_name, opens_at, closes_at, status)
                VALUES (
                    league_rec.league_id,
                    slot_idx,
                    slot_name,
                    league_rec.draft_opens_at,
                    league_rec.draft_closes_at,
                    CASE
                        WHEN league_rec.draft_status = 'active' AND (cs->>'active_slot_index')::INTEGER = slot_idx THEN 'active'
                        WHEN league_rec.draft_status = 'completed' THEN 'completed'
                        ELSE 'pending'
                    END
                )
                ON CONFLICT (league_id, slot_index) DO NOTHING;
            END LOOP;
        END;
    END LOOP;
END $$;

-- Auto-update trigger
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
