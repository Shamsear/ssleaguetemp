const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function checkSchema() {
  const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);
  
  console.log('Checking player_seasons table schema...\n');
  
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'player_seasons' 
    ORDER BY ordinal_position
  `;
  
  console.log('Columns in player_seasons table:');
  columns.forEach(col => {
    console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
  });
  
  console.log('\nSample data:');
  const sample = await sql`
    SELECT * FROM player_seasons LIMIT 1
  `;
  
  if (sample.length > 0) {
    console.log(JSON.stringify(sample[0], null, 2));
  } else {
    console.log('No data found');
  }
}

checkSchema().catch(console.error);
