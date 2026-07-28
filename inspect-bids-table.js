/**
 * Inspect the bids table structure and data for SSPSLS16
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const auctionSql = neon(process.env.NEON_AUCTION_DB_URL);

async function inspectBidsTable() {
  console.log('\n🔍 Inspecting bids table\n');

  try {
    // Get sample winning bids from SSPSLS16
    const sampleBids = await auctionSql`
      SELECT 
        b.*,
        r.round_number,
        r.season_id,
        fp.name as player_name
      FROM bids b
      JOIN rounds r ON b.round_id = r.id
      LEFT JOIN footballplayers fp ON b.player_id = fp.id
      WHERE b.status = 'won'
        AND r.season_id = 'SSPSLS16'
      LIMIT 5
    `;

    console.log('Sample winning bids from SSPSLS16:');
    console.log(JSON.stringify(sampleBids, null, 2));

    // Check all columns in bids table
    console.log('\n📊 Column analysis:');
    if (sampleBids.length > 0) {
      const firstBid = sampleBids[0];
      console.log('Available columns in bids table:');
      for (const [key, value] of Object.entries(firstBid)) {
        console.log(`  ${key}: ${value === null ? 'NULL' : typeof value} ${value !== null ? `(example: ${value})` : ''}`);
      }
    }

    // Check if there's a different status or field that has the price
    console.log('\n🔍 Checking for alternative price fields:');
    const allColumns = await auctionSql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'bids'
      ORDER BY ordinal_position
    `;

    console.log('\nAll columns in bids table:');
    for (const col of allColumns) {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    }

    // Check for bids with non-null amounts
    const bidsWithAmounts = await auctionSql`
      SELECT 
        status,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE amount IS NULL) as null_amount,
        COUNT(*) FILTER (WHERE amount IS NOT NULL) as has_amount
      FROM bids b
      JOIN rounds r ON b.round_id = r.id
      WHERE r.season_id = 'SSPSLS16'
      GROUP BY status
      ORDER BY count DESC
    `;

    console.log('\n📊 Bids by status (SSPSLS16):');
    for (const stat of bidsWithAmounts) {
      console.log(`\n  Status: ${stat.status}`);
      console.log(`    Total: ${stat.count}`);
      console.log(`    NULL amount: ${stat.null_amount}`);
      console.log(`    Has amount: ${stat.has_amount}`);
    }

    // Check if winning bids should be coming from a different table
    console.log('\n🔍 Checking rounds table for winning data:');
    const roundsData = await auctionSql`
      SELECT 
        r.id,
        r.round_number,
        r.status,
        r.round_type,
        COUNT(b.id) as total_bids,
        COUNT(b.id) FILTER (WHERE b.status = 'won') as won_bids
      FROM rounds r
      LEFT JOIN bids b ON r.id = b.round_id
      WHERE r.season_id = 'SSPSLS16'
        AND r.round_type != 'bulk'
      GROUP BY r.id
      ORDER BY r.round_number
      LIMIT 10
    `;

    console.log('\nRounds with bids:');
    for (const round of roundsData) {
      console.log(`\n  Round ${round.round_number} (${round.round_type})`);
      console.log(`    Status: ${round.status}`);
      console.log(`    Total bids: ${round.total_bids}`);
      console.log(`    Won bids: ${round.won_bids}`);
    }

    console.log('\n✅ Inspection complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

inspectBidsTable();
