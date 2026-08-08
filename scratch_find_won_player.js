const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function main() {
  const result = await sql`
    SELECT tp.*, fp.name as player_name, fp.position, r.round_type
    FROM team_players tp
    JOIN footballplayers fp ON tp.player_id = fp.id
    LEFT JOIN rounds r ON tp.round_id = r.id
    WHERE tp.season_id = 'SSPSLS18'
    LIMIT 10
  `;
  console.log('WON PLAYERS FOR SEASON 18:');
  console.dir(result, { depth: null });
}

main().catch(console.error);
