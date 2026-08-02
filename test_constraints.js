require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
async function run() {
  const result = await sql`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'team_players'::regclass;
  `;
  console.log(result);
}
run().catch(console.error);
