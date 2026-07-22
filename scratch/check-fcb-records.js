require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
if (!connectionString) {
  console.error('NEON_TOURNAMENT_DB_URL is not set.');
  process.exit(1);
}

const sql = neon(connectionString);

async function checkRecords() {
  const teamId = 'SSPSLT0006';
  console.log(`=== Checking Neon records for ${teamId} in S8, S9, S10 ===\n`);

  // We can query each table explicitly
  try {
    const teamstats = await sql`
      SELECT COUNT(*)::int as count FROM teamstats 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`teamstats: ${teamstats[0].count}`);
  } catch (e) { console.error('teamstats error:', e.message); }

  try {
    const player_seasons = await sql`
      SELECT COUNT(*)::int as count FROM player_seasons 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`player_seasons: ${player_seasons[0].count}`);
  } catch (e) { console.error('player_seasons error:', e.message); }

  try {
    const realplayerstats = await sql`
      SELECT COUNT(*)::int as count FROM realplayerstats 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`realplayerstats: ${realplayerstats[0].count}`);
  } catch (e) { console.error('realplayerstats error:', e.message); }

  try {
    const team_players = await sql`
      SELECT COUNT(*)::int as count FROM team_players 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`team_players: ${team_players[0].count}`);
  } catch (e) { console.error('team_players error:', e.message); }

  try {
    const managers = await sql`
      SELECT COUNT(*)::int as count FROM managers 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`managers: ${managers[0].count}`);
  } catch (e) { console.error('managers error:', e.message); }

  try {
    const awards = await sql`
      SELECT COUNT(*)::int as count FROM awards 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`awards: ${awards[0].count}`);
  } catch (e) { console.error('awards error:', e.message); }

  try {
    const team_trophies = await sql`
      SELECT COUNT(*)::int as count FROM team_trophies 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`team_trophies: ${team_trophies[0].count}`);
  } catch (e) { console.error('team_trophies error:', e.message); }

  try {
    const owners = await sql`
      SELECT COUNT(*)::int as count FROM owners 
      WHERE team_id = ${teamId} AND season_id IN ('SSPSLS8', 'SSPSLS9', 'SSPSLS10')
    `;
    console.log(`owners: ${owners[0].count}`);
  } catch (e) { console.error('owners error:', e.message); }
}

checkRecords();
