const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.NEON_TOURNAMENT_DB_URL;

if (!dbUrl) {
  console.error('❌ NEON_TOURNAMENT_DB_URL not found in environment!');
  process.exit(1);
}

const sql = neon(dbUrl);

async function run() {
  console.log('--- Inspecting player_awards Unique Values ---');
  
  try {
    const results = await sql`
      SELECT DISTINCT award_type, award_category, player_category, award_position
      FROM player_awards
      ORDER BY award_type
    `;
    
    console.log(`Found ${results.length} distinct award types/positions:\n`);
    results.forEach(r => {
      console.log(`  - Type: "${r.award_type}" | Category: "${r.award_category}" | Position/Role: "${r.player_category || 'N/A'}" | Award Pos: "${r.award_position || 'N/A'}"`);
    });
    
  } catch (err) {
    console.error('❌ Error querying "player_awards" table:', err.message);
  }
}

run().then(() => process.exit(0));
