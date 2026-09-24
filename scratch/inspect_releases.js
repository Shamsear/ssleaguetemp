const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');

async function run() {
  const leagueId = 'SSPSLFLS18';

  const teams = await sql`SELECT team_id, team_name, owner_name, supported_team_id FROM fantasy_teams WHERE league_id = ${leagueId}`;
  console.log('--- FANTASY TEAMS ---');
  console.log(JSON.stringify(teams, null, 2));

  const releases = await sql`SELECT * FROM fantasy_releases WHERE league_id = ${leagueId}`;
  console.log('--- ALL RELEASES ---');
  console.log(JSON.stringify(releases, null, 2));

  const windows = await sql`SELECT * FROM fantasy_transfer_windows WHERE league_id = ${leagueId}`;
  console.log('--- TRANSFER WINDOWS ---');
  console.log(JSON.stringify(windows, null, 2));
}

run().catch(console.error);
