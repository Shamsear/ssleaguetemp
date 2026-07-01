const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envPath = path.join(__dirname, '../.env.local');
let dbUrl = '';
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  dbUrl = content.split('\n').find(l => l.startsWith('NEON_AUCTION_DB_URL=')).split('NEON_AUCTION_DB_URL=')[1].trim();
  if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) dbUrl = dbUrl.substring(1, dbUrl.length - 1);
}

async function run() {
  const sql = neon(dbUrl);
  console.log("Connected to Neon Auction DB. Fetching columns for table 'footballplayers'...");
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'footballplayers'
  `;
  console.log("Columns of 'footballplayers':", cols);
}

run().catch(console.error);
