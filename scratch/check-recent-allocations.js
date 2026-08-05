const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function run() {
  try {
    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rounds'
    `;
    console.log('Columns in rounds:');
    console.table(columns);

    const constraints = await sql`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'rounds'::regclass
    `;
    console.log('Constraints on rounds:');
    console.log(constraints);

  } catch (error) {
    console.error(error);
  }
}
run();
