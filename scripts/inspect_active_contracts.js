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

  console.log("=== INSPECTING ACTIVE CONTRACTS IN AUCTION DB (footballplayers) ===");
  // Query players whose contract ends after S17.
  // Season IDs are e.g., 'SSPSLS17', 'SSPSLS18', etc.
  const auctionPlayers = await auctionSql`
    SELECT id, name, team_name, contract_id, contract_start_season, contract_end_season, contract_length
    FROM footballplayers
    WHERE contract_end_season IS NOT NULL 
      AND contract_end_season != ''
  `;
  
  console.log(`Total football players with contracts: ${auctionPlayers.length}`);
  const s18PlusAuction = auctionPlayers.filter(p => {
    const endSeasonNum = parseInt(p.contract_end_season.replace(/\D/g, '')) || 0;
    return endSeasonNum >= 18;
  });
  console.log(`Players with contracts ending in S18+: ${s18PlusAuction.length}`);
  if (s18PlusAuction.length > 0) {
    console.log("Sample S18+ players:", s18PlusAuction.slice(0, 10));
  }

  console.log("\n=== INSPECTING ACTIVE CONTRACTS IN TOURNAMENT DB (player_seasons) ===");
  const tournamentPlayers = await tournamentSql`
    SELECT id, player_name, team, contract_id, contract_start_season, contract_end_season, contract_length
    FROM player_seasons
    WHERE contract_end_season IS NOT NULL 
      AND contract_end_season != ''
  `;
  console.log(`Total real players in player_seasons with contracts: ${tournamentPlayers.length}`);
  const s18PlusTournament = tournamentPlayers.filter(p => {
    const endSeasonNum = parseInt(p.contract_end_season.replace(/\D/g, '')) || 0;
    return endSeasonNum >= 18;
  });
  console.log(`Real players with contracts ending in S18+: ${s18PlusTournament.length}`);
  if (s18PlusTournament.length > 0) {
    console.log("Sample S18+ real players:", s18PlusTournament.slice(0, 10));
  }
}

run().catch(console.error);
