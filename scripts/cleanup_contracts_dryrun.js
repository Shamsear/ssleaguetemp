const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envPath = path.join(__dirname, '../.env.local');
let auctionDbUrl = '';
let tournamentDbUrl = '';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  
  const auctionLine = lines.find(l => l.startsWith('NEON_AUCTION_DB_URL='));
  if (auctionLine) {
    auctionDbUrl = auctionLine.split('NEON_AUCTION_DB_URL=')[1].trim();
    if (auctionDbUrl.startsWith('"') && auctionDbUrl.endsWith('"')) auctionDbUrl = auctionDbUrl.substring(1, auctionDbUrl.length - 1);
  }
  
  const tournamentLine = lines.find(l => l.startsWith('NEON_TOURNAMENT_DB_URL='));
  if (tournamentLine) {
    tournamentDbUrl = tournamentLine.split('NEON_TOURNAMENT_DB_URL=')[1].trim();
    if (tournamentDbUrl.startsWith('"') && tournamentDbUrl.endsWith('"')) tournamentDbUrl = tournamentDbUrl.substring(1, tournamentDbUrl.length - 1);
  }
}

async function run() {
  const auctionSql = neon(auctionDbUrl);
  const tournamentSql = neon(tournamentDbUrl);

  console.log("=== DRY RUN: CLEANUP AUCTION DB (footballplayers) ===");
  // Find rows with contract_end_season >= 18
  const toUpdateAuction = await auctionSql`
    SELECT id, name, contract_end_season, season_id FROM footballplayers
    WHERE contract_end_season IS NOT NULL AND contract_end_season != ''
      AND CAST(REGEXP_REPLACE(contract_end_season, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log(`Will update ${toUpdateAuction.length} footballplayers to end at 'SSPSLS17'`);

  // Find rows with season_id >= 18 in footballplayers (if any exist)
  const futureSeasonAuction = await auctionSql`
    SELECT id, name, season_id FROM footballplayers
    WHERE season_id IS NOT NULL AND season_id != ''
      AND CAST(REGEXP_REPLACE(season_id, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log(`Will delete ${futureSeasonAuction.length} footballplayers rows belonging to S18+`);

  console.log("\n=== DRY RUN: CLEANUP TOURNAMENT DB (player_seasons) ===");
  // Find rows with contract_end_season >= 18
  const toUpdateTournament = await tournamentSql`
    SELECT id, player_name, contract_end_season, season_id FROM player_seasons
    WHERE contract_end_season IS NOT NULL AND contract_end_season != ''
      AND CAST(REGEXP_REPLACE(contract_end_season, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log(`Will update ${toUpdateTournament.length} player_seasons to end at 'SSPSLS17'`);

  // Find rows with season_id >= 18 in player_seasons
  const futureSeasonTournament = await tournamentSql`
    SELECT id, player_name, season_id FROM player_seasons
    WHERE season_id IS NOT NULL AND season_id != ''
      AND CAST(REGEXP_REPLACE(season_id, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log(`Will delete ${futureSeasonTournament.length} player_seasons rows belonging to S18+`);
  if (futureSeasonTournament.length > 0) {
    console.log("Sample rows to delete:", futureSeasonTournament.slice(0, 10));
  }
}

run().catch(console.error);
