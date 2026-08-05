const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function run() {
  try {
    const teamId = 'SSPSLT0005'; // TM ASGARDIANS

    // 1. Get all players from footballplayers table currently marked as owned by this team
    const players = await sql`
      SELECT id, name, position, overall_rating, is_sold, team_id, acquisition_value, round_id
      FROM footballplayers
      WHERE team_id = ${teamId}
    `;
    console.log(`Players in footballplayers table for team ${teamId} (${players.length}):`);
    console.log(players.map(p => ({
      id: p.id,
      name: p.name,
      position: p.position,
      is_sold: p.is_sold,
      acquisition_value: p.acquisition_value,
      round_id: p.round_id
    })));

  } catch (error) {
    console.error(error);
  }
}
run();
