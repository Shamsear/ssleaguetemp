require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');
const sql=neon(process.env.NEON_TOURNAMENT_DB_URL);

(async () => {
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='realplayerstats' 
    ORDER BY ordinal_position
  `;
  console.log('Columns in realplayerstats:');
  cols.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`));
  
  // Also check a sample row
  const sample = await sql`SELECT * FROM realplayerstats WHERE player_id='sspslpsl0055' LIMIT 1`;
  console.log('\nSample row keys:', Object.keys(sample[0] || {}));
})();
