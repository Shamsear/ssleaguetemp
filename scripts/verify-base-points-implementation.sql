-- Verification Script: Fantasy Base Points Implementation
-- Run this after applying the migration to verify everything works

-- 1. Check if team_id is now nullable
SELECT 
    column_name, 
    is_nullable, 
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'fantasy_player_points' 
    AND column_name IN ('team_id', 'league_id', 'real_player_id', 'fantasy_round_id');

-- 2. Check if unique constraint exists for undrafted players
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'fantasy_player_points'
    AND indexname LIKE '%null_team%';

-- 3. Count base points records (team_id = NULL)
SELECT 
    COUNT(*) as undrafted_player_points_count,
    COUNT(DISTINCT real_player_id) as unique_undrafted_players,
    COUNT(DISTINCT league_id) as leagues_with_base_points,
    COUNT(DISTINCT fantasy_round_id) as rounds_with_base_points
FROM fantasy_player_points
WHERE team_id IS NULL;

-- 4. Count drafted player points (team_id IS NOT NULL)
SELECT 
    COUNT(*) as drafted_player_points_count,
    COUNT(DISTINCT real_player_id) as unique_drafted_players,
    COUNT(DISTINCT team_id) as teams_with_players,
    AVG(points_multiplier) as avg_multiplier
FROM fantasy_player_points
WHERE team_id IS NOT NULL;

-- 5. Sample base points records
SELECT 
    fpp.league_id,
    fpp.real_player_id,
    fpp.player_name,
    fpp.fantasy_round_id,
    fpp.base_points,
    fpp.total_points,
    fpp.points_multiplier,
    fpp.is_captain,
    fpp.team_id,
    fpp.recorded_at
FROM fantasy_player_points fpp
WHERE fpp.team_id IS NULL
ORDER BY fpp.base_points DESC
LIMIT 10;

-- 6. Compare: Same player's base points vs drafted points in same round
SELECT 
    base.real_player_id,
    base.player_name,
    base.fantasy_round_id,
    base.base_points as undrafted_base_points,
    base.total_points as undrafted_total,
    drafted.base_points as drafted_base_points,
    drafted.total_points as drafted_total_with_multiplier,
    drafted.points_multiplier,
    drafted.is_captain,
    drafted.is_vice_captain,
    ft.team_name as drafted_by_team
FROM fantasy_player_points base
LEFT JOIN fantasy_player_points drafted 
    ON base.real_player_id = drafted.real_player_id
    AND base.fantasy_round_id = drafted.fantasy_round_id
    AND drafted.team_id IS NOT NULL
LEFT JOIN fantasy_teams ft ON ft.team_id = drafted.team_id
WHERE base.team_id IS NULL
    AND base.base_points > 0
ORDER BY base.base_points DESC
LIMIT 20;

-- 7. Check fantasy_players table - total_points should include base points for undrafted
SELECT 
    fp.real_player_id,
    fp.is_available,
    fp.total_points as fantasy_players_total,
    COALESCE(SUM(fpp.base_points) FILTER (WHERE fpp.team_id IS NULL), 0) as sum_base_points,
    COALESCE(SUM(fpp.total_points) FILTER (WHERE fpp.team_id IS NOT NULL), 0) as sum_drafted_points,
    fs.team_id as drafted_by_team
FROM fantasy_players fp
LEFT JOIN fantasy_player_points fpp 
    ON fpp.real_player_id = fp.real_player_id 
    AND fpp.league_id = fp.league_id
LEFT JOIN fantasy_squad fs 
    ON fs.real_player_id = fp.real_player_id 
    AND fs.league_id = fp.league_id
GROUP BY fp.real_player_id, fp.is_available, fp.total_points, fs.team_id
ORDER BY fp.total_points DESC
LIMIT 15;

-- 8. Verify no duplicate base points for same player-round
SELECT 
    league_id,
    real_player_id,
    fantasy_round_id,
    COUNT(*) as duplicate_count
FROM fantasy_player_points
WHERE team_id IS NULL
GROUP BY league_id, real_player_id, fantasy_round_id
HAVING COUNT(*) > 1;

-- 9. Check if all undrafted players have base points for recent rounds
SELECT 
    fr.round_number,
    fr.round_name,
    fr.is_completed,
    COUNT(DISTINCT fp.real_player_id) as total_players_in_league,
    COUNT(DISTINCT CASE WHEN fp.is_available THEN fp.real_player_id END) as undrafted_players,
    COUNT(DISTINCT fpp.real_player_id) as players_with_base_points
FROM fantasy_rounds fr
CROSS JOIN fantasy_players fp
LEFT JOIN fantasy_player_points fpp 
    ON fpp.real_player_id = fp.real_player_id
    AND fpp.fantasy_round_id = fr.round_id
    AND fpp.league_id = fp.league_id
    AND fpp.team_id IS NULL
WHERE fr.league_id = fp.league_id
    AND fr.is_completed = true
GROUP BY fr.round_number, fr.round_name, fr.is_completed
ORDER BY fr.round_number DESC
LIMIT 5;

-- 10. Summary report
SELECT 
    'Implementation Status' as check_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'fantasy_player_points' 
            AND column_name = 'team_id' 
            AND is_nullable = 'YES'
        ) THEN '✅ team_id is nullable'
        ELSE '❌ team_id is still NOT NULL'
    END as status
UNION ALL
SELECT 
    'Base Points Records',
    CASE 
        WHEN (SELECT COUNT(*) FROM fantasy_player_points WHERE team_id IS NULL) > 0 
        THEN '✅ ' || (SELECT COUNT(*) FROM fantasy_player_points WHERE team_id IS NULL)::text || ' base point records found'
        ELSE '⚠️ No base points records yet (run calculateLineupPoints)'
    END
UNION ALL
SELECT 
    'Unique Constraint',
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'fantasy_player_points' 
            AND indexname LIKE '%null_team%'
        ) THEN '✅ Unique constraint exists'
        ELSE '❌ Missing unique constraint'
    END;
