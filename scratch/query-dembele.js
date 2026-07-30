const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function queryDembele() {
  const tournamentSql = neon(process.env.NEON_TOURNAMENT_DB_URL);
  
  try {
    console.log("=== CHECKING realplayerstats BY ID ===");
    const rps = await tournamentSql`
      SELECT player_id, player_name, team_id, team, season_id 
      FROM realplayerstats 
      WHERE player_id = '110626'
    `;
    console.log(JSON.stringify(rps, null, 2));

    console.log("\n=== CHECKING player_seasons BY ID ===");
    const ps = await tournamentSql`
      SELECT player_id, player_name, team_id, team, season_id 
      FROM player_seasons 
      WHERE player_id = '110626'
    `;
    console.log(JSON.stringify(ps, null, 2));
  } catch (err) {
    console.error(err);
  }
}
queryDembele();
