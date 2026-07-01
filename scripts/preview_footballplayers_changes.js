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
  
  // Since we already ran the update in the previous step, the contract_end_season for these players has been set to 'SSPSLS17'.
  // However, we can identify which players were updated by querying those whose contract_end_season is 'SSPSLS17' and had contract_length updated,
  // or we can select players whose contract_end_season is 'SSPSLS17' to display the affected list.
  // Wait, let's also check if there are any remaining or if we want to show the list of players who were updated.
  // To show the exact list of the 85 players whose contracts were ended at S17:
  const players = await sql`
    SELECT id, name, team_name, contract_id, contract_start_season, contract_end_season, contract_length
    FROM footballplayers
    WHERE contract_end_season = 'SSPSLS17' AND contract_start_season IS NOT NULL AND contract_start_season != 'SSPSLS17'
    ORDER BY name ASC
  `;

  // Note: Some players might have had natural 1-season contracts starting and ending in S17, 
  // so we filter for players whose start season was before S17 but contract was ended, or whose contract was modified.
  // Actually, let's list all players whose contract_end_season is 'SSPSLS17' and had contract_length reset to 1/null,
  // or simply output all players currently ending at S17.
  const output = {
    count: players.length,
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      team_name: p.team_name,
      start_season: p.contract_start_season,
      end_season: p.contract_end_season,
      contract_length: p.contract_length
    }))
  };

  fs.writeFileSync(path.join(__dirname, 'preview_footballplayers.json'), JSON.stringify(output, null, 2));
  console.log("SUCCESS: Preview saved to scripts/preview_footballplayers.json");
}

run().catch(console.error);
