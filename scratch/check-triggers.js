const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function run() {
  try {
    const triggers = await sql`
      SELECT 
        tgname AS trigger_name,
        relname AS table_name,
        tgtype,
        tgenabled
      FROM pg_trigger
      JOIN pg_class ON pg_class.oid = tgrelid
      WHERE relname = 'rounds'
    `;
    console.log('Triggers on rounds table:');
    console.log(triggers);

    // Let's also check all triggers in the database
    const allTriggers = await sql`
      SELECT 
        tgname AS trigger_name,
        relname AS table_name
      FROM pg_trigger
      JOIN pg_class ON pg_class.oid = tgrelid
      JOIN pg_namespace ON pg_namespace.oid = relnamespace
      WHERE nspname = 'public' AND tgisinternal = false
    `;
    console.log('Non-internal triggers in public schema:');
    console.log(allTriggers);

  } catch (error) {
    console.error(error);
  }
}
run();
