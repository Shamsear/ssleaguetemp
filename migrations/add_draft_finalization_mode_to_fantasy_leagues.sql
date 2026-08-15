-- Migration: Add draft_finalization_mode to fantasy_leagues table
-- Purpose: Enable manual/auto finalization options for fantasy draft (similar to normal auction rounds)
-- Created: 2026-08-15

-- Add draft_finalization_mode column to fantasy_leagues
-- Default is 'auto' for backward compatibility
ALTER TABLE fantasy_leagues 
ADD COLUMN IF NOT EXISTS draft_finalization_mode VARCHAR(20) DEFAULT 'auto';

-- Add comment to document the column
COMMENT ON COLUMN fantasy_leagues.draft_finalization_mode IS 'Finalization mode: auto (automatic finalization when draft closes) or manual (requires admin confirmation)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fantasy_leagues_finalization_mode 
ON fantasy_leagues(draft_finalization_mode);

-- Update existing leagues to use 'auto' mode (default behavior)
UPDATE fantasy_leagues 
SET draft_finalization_mode = 'auto' 
WHERE draft_finalization_mode IS NULL;

-- Verify the changes
SELECT league_id, season_name, draft_status, draft_finalization_mode 
FROM fantasy_leagues 
ORDER BY created_at DESC 
LIMIT 5;
