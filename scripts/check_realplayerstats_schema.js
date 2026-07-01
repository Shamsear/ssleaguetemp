const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

// Load env
const envPath = path.join(__dirname, '../.env.local');
let dbUrl = '';
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  dbUrl = content.split('\n').find(l => l.startsWith('NEON_TOURNAMENT_DB_URL=')).split('NEON_TOURNAMENT_DB_URL=')[1].trim();
  if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) dbUrl = dbUrl.substring(1, dbUrl.length - 1);
  if (dbUrl.startsWith("'") && dbUrl.endsWith("'")) dbUrl = dbUrl.substring(1, dbUrl.length - 1);
}

async function run() {
  const sql = neon(dbUrl);
  console.log("=== Columns in player_seasons ===");
  const psCols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'player_seasons'
  `;
  psCols.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));

  console.log("\n=== Columns in realplayerstats ===");
  const rpsCols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'realplayerstats'
  `;
  rpsCols.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));
  
  // Query 1 row from realplayerstats
  const rows = await sql`SELECT * FROM realplayerstats LIMIT 1`;
  console.log("\nSample row from realplayerstats:", rows[0]);
}

run().catch(console.error);
