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

  console.log("=== EXECUTING CLEANUP IN AUCTION DB (footballplayers) ===");
  const updateAuctionResult = await auctionSql`
    UPDATE footballplayers
    SET 
      contract_end_season = 'SSPSLS17',
      contract_length = 1,
      contract_id = NULL,
      updated_at = NOW()
    WHERE contract_end_season IS NOT NULL AND contract_end_season != ''
      AND CAST(REGEXP_REPLACE(contract_end_season, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log("Successfully updated footballplayers contracts!");

  console.log("\n=== EXECUTING CLEANUP IN TOURNAMENT DB (player_seasons) ===");
  const updateTournamentResult = await tournamentSql`
    UPDATE player_seasons
    SET 
      contract_end_season = 'SSPSLS17',
      contract_length = 1,
      contract_id = NULL,
      updated_at = NOW()
    WHERE contract_end_season IS NOT NULL AND contract_end_season != ''
      AND CAST(REGEXP_REPLACE(contract_end_season, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log("Successfully updated player_seasons contracts!");

  const deleteTournamentResult = await tournamentSql`
    DELETE FROM player_seasons
    WHERE season_id IS NOT NULL AND season_id != ''
      AND CAST(REGEXP_REPLACE(season_id, '[^0-9.]', '', 'g') AS DECIMAL) >= 18
  `;
  console.log(`Successfully deleted ${deleteTournamentResult.length || 0} future player_seasons rows belonging to S18+!`);
}

run().catch(console.error);
