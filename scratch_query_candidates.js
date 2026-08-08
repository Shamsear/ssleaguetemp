const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function main() {
  const result = await sql`
    SELECT DISTINCT round_id FROM round_players LIMIT 10
  `;
  console.log('DISTINCT ROUND IDS IN round_players:');
  console.dir(result, { depth: null });
}

main().catch(console.error);
