const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function listTables() {
  console.log('🔍 Listing all tables in the public schema of Neon Postgres...');

  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name ASC
    `;
    console.log('\n📊 Tables in public schema:');
    console.table(tables);
  } catch (error) {
    console.error('❌ Error listing tables:', error);
  }
}

listTables();
