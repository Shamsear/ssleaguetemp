const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
});

const { neon } = require('@neondatabase/serverless');
const auctionSql = neon(process.env.NEON_AUCTION_DB_URL);

async function checkRoundDetails() {
  const roundId = 'SSPSLFBR00015';

  const cols = await auctionSql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'round_players'
  `;
  console.log('round_players columns:', cols.map(c => c.column_name));

  const players = await auctionSql`
    SELECT rp.*, fp.name as player_name
    FROM round_players rp
    LEFT JOIN footballplayers fp ON fp.player_id = rp.player_id AND fp.season_id = 'SSPSLS18'
    WHERE rp.round_id = ${roundId}
  `;
  console.log(`Players count: ${players.length}`);
  const statusCounts = {};
  players.forEach(p => {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  });
  console.log('Player status breakdown:', statusCounts);

  const nonSold = players.filter(p => p.status !== 'sold');
  console.log('Non-sold players in round:', nonSold);

  const bids = await auctionSql`
    SELECT rb.*, t.name as team_name
    FROM round_bids rb
    LEFT JOIN teams t ON t.id = rb.team_id
    WHERE rb.round_id = ${roundId}
  `;
  console.log(`Total bids in round: ${bids.length}`);

  // Let's see all bids grouped by player
  const bidsByPlayer = {};
  bids.forEach(b => {
    if (!bidsByPlayer[b.player_id]) bidsByPlayer[b.player_id] = [];
    bidsByPlayer[b.player_id].push(b);
  });
  for (const [pId, pBids] of Object.entries(bidsByPlayer)) {
    console.log(`Player ${pId}: ${pBids.length} bids`, pBids.map(b => ({ team: b.team_name, bid: b.bid_amount, is_winning: b.is_winning, status: b.status })));
  }

  // Check bulk tiebreakers!
  const bulkTb = await auctionSql`
    SELECT * FROM bulk_tiebreakers WHERE round_id = ${roundId}
  `;
  console.log('Bulk tiebreakers:', bulkTb);

  const normalTb = await auctionSql`
    SELECT * FROM tiebreakers WHERE round_id = ${roundId}
  `;
  console.log('Normal tiebreakers:', normalTb);
}

checkRoundDetails().catch(console.error);
