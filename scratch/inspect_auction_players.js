const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envPath = path.join(__dirname, '../.env.local');
let dbUrl = '';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  const auctionLine = lines.find(l => l.startsWith('NEON_AUCTION_DB_URL='));
  if (auctionLine) {
    dbUrl = auctionLine.split('NEON_AUCTION_DB_URL=')[1].trim();
    if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) dbUrl = dbUrl.substring(1, dbUrl.length - 1);
  }
}

async function run() {
  const sql = neon(dbUrl);
  
  const players = ['sspslpsl0028', 'sspslpsl0034', 'sspslpsl0024'];
  
  for (const pid of players) {
    const rows = await sql`
      SELECT id, name, team_id, is_sold, status, season_id, contract_start_season, contract_end_season, contract_length
      FROM footballplayers
      WHERE id = ${pid}
    `;
    console.log(`\n=== Auction DB Player: ${pid} ===`);
    console.table(rows);
  }
}

run().catch(console.error);
