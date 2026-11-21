require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function test() {
  const teams = await sql('SELECT id, name, season_id FROM teams LIMIT 5');
  console.log('sample teams:', teams);
  
  const countWithSeason = await sql("SELECT COUNT(*) FROM teams WHERE season_id = 'SSPSLS19'");
  console.log('teams with season_id SSPSLS19:', countWithSeason);

  const totalTeams = await sql('SELECT COUNT(*) FROM teams');
  console.log('total teams:', totalTeams);

  const seasons = await sql('SELECT id, name, is_active FROM seasons');
  console.log('seasons:', seasons);

  // Check the team from the screenshot: £9,737M squad value, 25 players
  const teamSeasons = await sql("SELECT * FROM team_seasons WHERE season_id = 'SSPSLS19' AND total_players = 25");
  console.log('team_seasons with 25 players:', teamSeasons);

  // Check footballplayers for this team
  if (teamSeasons.length > 0) {
    const teamId = teamSeasons[0].team_id;
    const fp = await sql("SELECT id, name, team_id, season_id, contract_end_season FROM footballplayers WHERE team_id = $1", [teamId]);
    console.log(`footballplayers for team ${teamId} count:`, fp.length);
    console.log('sample footballplayer:', fp.slice(0, 3));

    // Also check team_players table
    const tp = await sql("SELECT * FROM team_players WHERE team_id = $1 AND season_id = 'SSPSLS19'", [teamId]);
    console.log(`team_players for team ${teamId} count:`, tp.length);
    console.log('sample team_player:', tp.slice(0, 3));
  }
}

test().catch(console.error);
