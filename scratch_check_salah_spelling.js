const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function main() {
  const results = await sql`
    SELECT id, name, player_id, position 
    FROM footballplayers 
    WHERE name ILIKE '%salah%'
  `;
  console.log('PLAYERS MATCHING SALAH:');
  console.dir(results, { depth: null });
}

main().catch(console.error);
