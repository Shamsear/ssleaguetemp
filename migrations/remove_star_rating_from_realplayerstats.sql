-- Migration: Remove star_rating column from realplayerstats table
-- This column is no longer needed as star ratings are managed separately

-- Drop the star_rating column
ALTER TABLE realplayerstats DROP COLUMN IF EXISTS star_rating;

-- Note: This is a destructive operation. If you need to preserve the data,
-- create a backup first or migrate the data to another table before running this.
