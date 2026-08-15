-- Migration: Enable base points tracking for ALL players (drafted and undrafted)
-- This allows teams to view performance of all players for acquisition planning

-- Step 1: Make team_id nullable to allow storing points for undrafted players
ALTER TABLE fantasy_player_points 
ALTER COLUMN team_id DROP NOT NULL;

-- Step 2: Add composite index for efficient queries on all players by league and round
CREATE INDEX IF NOT EXISTS idx_fantasy_player_points_league_round 
ON fantasy_player_points(league_id, fantasy_round_id);

-- Step 3: Add index for efficient player lookups
CREATE INDEX IF NOT EXISTS idx_fantasy_player_points_player 
ON fantasy_player_points(real_player_id);

-- Step 4: Add index for filtering by team ownership status
CREATE INDEX IF NOT EXISTS idx_fantasy_player_points_team_null 
ON fantasy_player_points(league_id, fantasy_round_id) 
WHERE team_id IS NULL;

-- Step 5: Update total_points in fantasy_players to include all rounds (not just drafted)
-- This will be maintained by the points calculator

COMMENT ON COLUMN fantasy_player_points.team_id IS 
'Fantasy team ID - NULL for undrafted players receiving base points only';

COMMENT ON INDEX idx_fantasy_player_points_league_round IS
'Efficiently query all players points by league and round for acquisition planning';
