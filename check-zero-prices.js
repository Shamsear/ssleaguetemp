/**
 * Check for zero or missing price values in auction history
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const auctionSql = neon(process.env.NEON_AUCTION_DB_URL);

async function checkZeroPrices() {
  console.log('\n🔍 Checking for zero/missing prices in auction history\n');

  try {
    // Check bulk rounds (round_players table)
    console.log('📊 Bulk Rounds (round_players):');
    const bulkStats = await auctionSql`
      SELECT 
        r.season_id,
        COUNT(*) as total_sold,
        COUNT(*) FILTER (WHERE rp.winning_bid IS NULL) as null_bids,
        COUNT(*) FILTER (WHERE rp.winning_bid = 0) as zero_bids,
        COUNT(*) FILTER (WHERE rp.winning_bid > 0) as valid_bids
      FROM round_players rp
      JOIN rounds r ON rp.round_id = r.id
      WHERE rp.status = 'sold'
        AND r.round_type = 'bulk'
      GROUP BY r.season_id
      ORDER BY r.season_id DESC
    `;

    if (bulkStats.length > 0) {
      for (const stat of bulkStats) {
        console.log(`\nSeason: ${stat.season_id}`);
        console.log(`  Total sold: ${stat.total_sold}`);
        console.log(`  NULL winning_bid: ${stat.null_bids}`);
        console.log(`  Zero winning_bid: ${stat.zero_bids}`);
        console.log(`  Valid winning_bid: ${stat.valid_bids}`);
      }
    } else {
      console.log('  No bulk round sales found');
    }

    // Check normal rounds (bids table)
    console.log('\n📊 Normal Rounds (bids):');
    const normalStats = await auctionSql`
      SELECT 
        r.season_id,
        COUNT(*) as total_won,
        COUNT(*) FILTER (WHERE b.amount IS NULL) as null_amounts,
        COUNT(*) FILTER (WHERE b.amount = 0) as zero_amounts,
        COUNT(*) FILTER (WHERE b.amount > 0) as valid_amounts
      FROM bids b
      JOIN rounds r ON b.round_id = r.id
      WHERE b.status = 'won'
        AND r.round_type != 'bulk'
      GROUP BY r.season_id
      ORDER BY r.season_id DESC
    `;

    if (normalStats.length > 0) {
      for (const stat of normalStats) {
        console.log(`\nSeason: ${stat.season_id}`);
        console.log(`  Total won: ${stat.total_won}`);
        console.log(`  NULL amount: ${stat.null_amounts}`);
        console.log(`  Zero amount: ${stat.zero_amounts}`);
        console.log(`  Valid amount: ${stat.valid_amounts}`);
      }
    } else {
      console.log('  No normal round wins found');
    }

    // Get sample of zero-price records
    console.log('\n🔍 Sample players with zero prices:');
    const zeroSamples = await auctionSql`
      SELECT 
        rp.player_name,
        rp.winning_bid,
        rp.base_price,
        rp.winning_team_id,
        t.name as team_name,
        r.round_number,
        r.season_id,
        r.round_type
      FROM round_players rp
      JOIN rounds r ON rp.round_id = r.id
      LEFT JOIN teams t ON rp.winning_team_id = t.id AND t.season_id = r.season_id
      WHERE rp.status = 'sold'
        AND (rp.winning_bid = 0 OR rp.winning_bid IS NULL)
      LIMIT 10
    `;

    if (zeroSamples.length > 0) {
      for (const sample of zeroSamples) {
        console.log(`\n  ${sample.player_name}`);
        console.log(`    Season: ${sample.season_id}, Round: ${sample.round_number} (${sample.round_type})`);
        console.log(`    Team: ${sample.team_name || sample.winning_team_id || 'Unknown'}`);
        console.log(`    winning_bid: ${sample.winning_bid === null ? 'NULL' : '£' + sample.winning_bid}`);
        console.log(`    base_price: £${sample.base_price}`);
      }
    } else {
      console.log('  ✅ No zero-price records found!');
    }

    // Check if any rounds are not finalized
    console.log('\n🔍 Checking unfinalized rounds:');
    const unfinalizedRounds = await auctionSql`
      SELECT 
        r.id,
        r.round_number,
        r.season_id,
        r.round_type,
        r.status,
        COUNT(rp.id) as player_count,
        COUNT(rp.id) FILTER (WHERE rp.status = 'sold') as sold_count
      FROM rounds r
      LEFT JOIN round_players rp ON r.id = rp.round_id
      WHERE r.status != 'completed'
        AND r.round_type = 'bulk'
      GROUP BY r.id
      ORDER BY r.season_id DESC, r.round_number DESC
      LIMIT 10
    `;

    if (unfinalizedRounds.length > 0) {
      console.log(`\nFound ${unfinalizedRounds.length} unfinalized bulk rounds:`);
      for (const round of unfinalizedRounds) {
        console.log(`\n  Round ${round.round_number} (${round.season_id})`);
        console.log(`    Status: ${round.status}`);
        console.log(`    Players: ${round.player_count} total, ${round.sold_count} sold`);
      }
    } else {
      console.log('  ✅ All bulk rounds are finalized');
    }

    console.log('\n✅ Check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkZeroPrices();
