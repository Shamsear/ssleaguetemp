-- Migration: Make team_id nullable in fantasy_player_points
-- Purpose: Allow storing base points for undrafted players (team_id = NULL)
-- This enables teams to view all players' base points for acquisition planning

-- Drop the foreign key constraint first
ALTER TABLE fantasy_player_points 
DROP CONSTRAINT IF EXISTS fantasy_player_points_team_id_fkey;

-- Make team_id nullable
ALTER TABLE fantasy_player_points 
ALTER COLUMN team_id DROP NOT NULL;

-- Recreate the foreign key constraint (will allow NULL)
ALTER TABLE fantasy_player_points 
ADD CONSTRAINT fantasy_player_points_team_id_fkey 
FOREIGN KEY (team_id) REFERENCES fantasy_teams(team_id);

-- Add a unique constraint for undrafted players (team_id = NULL case)
-- This ensures we don't duplicate base points for the same player in the same round
ALTER TABLE fantasy_player_points
DROP CONSTRAINT IF EXISTS fantasy_player_points_league_player_round_null_team_key;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_player_points_league_player_round_null_team_key
ON fantasy_player_points (league_id, real_player_id, fantasy_round_id)
WHERE team_id IS NULL;

-- Add comment to explain the schema
COMMENT ON COLUMN fantasy_player_points.team_id IS 
'Team ID - NULL for undrafted players'' base points, set for drafted players'' points with multipliers';

-- Verify the change
SELECT 
    column_name, 
    is_nullable, 
    data_type
FROM information_schema.columns
WHERE table_name = 'fantasy_player_points' 
    AND column_name = 'team_id';
