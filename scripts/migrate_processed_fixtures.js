const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

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
  console.log("Connected. Adding processed_fixtures column to realplayerstats table...");
  
  await sql`
    ALTER TABLE realplayerstats 
    ADD COLUMN IF NOT EXISTS processed_fixtures jsonb DEFAULT '[]'::jsonb
  `;
  
  console.log("Column added successfully!");
  
  // Verify columns again
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'realplayerstats' AND column_name = 'processed_fixtures'
  `;
  console.log("Verification:", cols);
}

run().catch(console.error);
