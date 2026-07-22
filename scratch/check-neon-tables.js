require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.NEON_TOURNAMENT_DB_URL;
if (!connectionString) {
  console.error('NEON_TOURNAMENT_DB_URL is not set.');
  process.exit(1);
}

const sql = neon(connectionString);

async function checkTables() {
  console.log(`=== Searching Neon tables with 'team_id' column ===\n`);

  try {
    const rows = await sql`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE column_name = 'team_id' 
        AND table_schema = 'public'
    `;
    console.log('Tables containing team_id:');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Error querying Neon:', err);
  }
  process.exit(0);
}

checkTables();
