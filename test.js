require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.NEON_TOURNAMENT_DB_URL });

const subquery = `
  SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, 
         COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, 
         COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, 
         COALESCE(points, 0) as points
  FROM realplayerstats
  UNION ALL
  SELECT player_id, player_name, season_id, COALESCE(goals_scored, 0) as goals_scored, 
         COALESCE(assists, 0) as assists, COALESCE(clean_sheets, 0) as clean_sheets, 
         COALESCE(matches_played, 0) as matches_played, COALESCE(wins, 0) as wins, 
         (COALESCE(points, 0) - COALESCE(base_points, 0)) as points
  FROM player_seasons
`;

pool.query(`
  SELECT 
    player_id,
    player_name,
    SUM(wins) as total_wins,
    SUM(matches_played) as total_matches,
    ROUND((SUM(wins)::numeric / NULLIF(SUM(matches_played), 0)) * 100, 1) as win_rate,
    COUNT(DISTINCT season_id) as seasons_played
  FROM (${subquery}) as realplayerstats
  GROUP BY player_id, player_name
  HAVING SUM(matches_played) >= 20
  ORDER BY win_rate DESC
  LIMIT 20
`).then(res => { console.log(res.rows); pool.end(); });
