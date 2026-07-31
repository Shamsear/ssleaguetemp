const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function checkConstraints() {
  console.log('🔍 Checking constraints on teams table...');

  try {
    const constraints = await sql`
      SELECT 
        conname AS constraint_name,
        contype AS constraint_type,
        pg_get_constraintdef(c.oid) AS constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'teams'::regclass
    `;
    console.table(constraints);
  } catch (error) {
    console.error('❌ Error checking constraints:', error);
  }
}

checkConstraints();
