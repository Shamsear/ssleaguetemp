
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.NEON_TOURNAMENT_DB_URL });

const leagueQuery = 'SELECT tt.team_name, COUNT(*) as cnt FROM team_trophies tt WHERE (tt.trophy_type ILIKE ''%league%'' OR tt.trophy_name ILIKE ''%league%'') AND (tt.trophy_position ILIKE ''%winner%'' OR tt.trophy_position ILIKE ''%champion%'' OR tt.position = 1) GROUP BY tt.team_name';

const cupQuery = 'SELECT tt.team_name, COUNT(*) as cnt FROM team_trophies tt WHERE (tt.trophy_type ILIKE ''%cup%'' OR tt.trophy_name ILIKE ''%cup%'') AND (tt.trophy_name NOT ILIKE ''%league%'') AND (tt.trophy_position ILIKE ''%winner%'' OR tt.trophy_position ILIKE ''%champion%'' OR tt.position = 1) GROUP BY tt.team_name';

Promise.all([
  pool.query(leagueQuery).then(res => console.log('League:', res.rows)),
  pool.query(cupQuery).then(res => console.log('Cup:', res.rows))
]).then(() => pool.end());

