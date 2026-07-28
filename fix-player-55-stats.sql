-- Fix Player Stats Transfer Issue
-- Player sspslpsl0055 has stats from S12-S8 that belong to another player named "SANJU"
-- Solution: Create new player "SANJU", transfer S12-S8 stats, rename 55 to "SANJU K"

-- Step 1: Check current player data
SELECT player_id, name, position, team_id 
FROM players 
WHERE player_id = 'sspslpsl0055';

-- Step 2: Check what stats exist for player 55
SELECT season_id, matches_played, runs, wickets, catches 
FROM season_player_stats 
WHERE player_id = 'sspslpsl0055' 
ORDER BY season_id DESC;

-- Step 3: Find the next available player ID
SELECT player_id 
FROM players 
ORDER BY player_id DESC 
LIMIT 5;

-- Step 4: Create new player "SANJU" (use next available ID, e.g., sspslpsl0156)
-- You'll need to update this with the correct next ID after checking Step 3
INSERT INTO players (
    player_id, 
    name, 
    position, 
    team_id,
    batting_style,
    bowling_style,
    jersey_number,
    created_at
)
SELECT 
    'sspslpsl0156', -- NEW PLAYER ID (update this based on Step 3)
    'SANJU',
    position,
    team_id,
    batting_style,
    bowling_style,
    NULL, -- No jersey number for historical player
    NOW()
FROM players 
WHERE player_id = 'sspslpsl0055';

-- Step 5: Transfer stats from S12, S11, S10, S9, S8 to new player "SANJU"
UPDATE season_player_stats 
SET player_id = 'sspslpsl0156' -- NEW PLAYER ID (update this)
WHERE player_id = 'sspslpsl0055' 
AND season_id IN ('SSPSLS12', 'SSPSLS11', 'SSPSLS10', 'SSPSLS9', 'SSPSLS8');

-- Step 6: Rename player 55 to "SANJU K"
UPDATE players 
SET name = 'SANJU K'
WHERE player_id = 'sspslpsl0055';

-- Step 7: Verify the changes
-- Check new player "SANJU"
SELECT player_id, name, position 
FROM players 
WHERE player_id = 'sspslpsl0156'; -- NEW PLAYER ID

-- Check stats for new player "SANJU" (should have S12-S8)
SELECT season_id, matches_played, runs, wickets, catches 
FROM season_player_stats 
WHERE player_id = 'sspslpsl0156' -- NEW PLAYER ID
ORDER BY season_id DESC;

-- Check player "SANJU K" (55)
SELECT player_id, name, position 
FROM players 
WHERE player_id = 'sspslpsl0055';

-- Check remaining stats for "SANJU K" (should NOT have S12-S8)
SELECT season_id, matches_played, runs, wickets, catches 
FROM season_player_stats 
WHERE player_id = 'sspslpsl0055' 
ORDER BY season_id DESC;

-- ============================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================
/*
-- Rollback: Transfer stats back
UPDATE season_player_stats 
SET player_id = 'sspslpsl0055'
WHERE player_id = 'sspslpsl0156'
AND season_id IN ('SSPSLS12', 'SSPSLS11', 'SSPSLS10', 'SSPSLS9', 'SSPSLS8');

-- Rollback: Delete new player
DELETE FROM players WHERE player_id = 'sspslpsl0156';

-- Rollback: Restore original name
UPDATE players 
SET name = 'SANJU' -- or whatever the original name was
WHERE player_id = 'sspslpsl0055';
*/
