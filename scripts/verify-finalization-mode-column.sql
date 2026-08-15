-- Verification Script: Check if draft_finalization_mode column exists
-- Run this BEFORE applying the migration to see current state

-- 1. Check if column exists in fantasy_leagues table
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'fantasy_leagues'
  AND column_name = 'draft_finalization_mode';

-- If the above returns 0 rows, the column does NOT exist yet
-- If it returns 1 row, the column already exists

-- 2. Check current fantasy_leagues table structure
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'fantasy_leagues'
ORDER BY ordinal_position;

-- 3. Check if any leagues exist (to verify migration will affect existing data)
SELECT 
    league_id, 
    season_name, 
    draft_status,
    created_at
FROM fantasy_leagues
ORDER BY created_at DESC
LIMIT 5;

-- Instructions:
-- If draft_finalization_mode column does NOT exist:
--   → Run: migrations/add_draft_finalization_mode_to_fantasy_leagues.sql
--
-- If draft_finalization_mode column already exists:
--   → Migration already applied, no action needed
