const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function listTables() {
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
    ORDER BY table_name
  `;
  
  console.log('Tables in database:');
  tables.forEach(t => console.log('  -', t.table_name));
}

listTables();
