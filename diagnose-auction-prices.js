/**
 * Diagnostic script to check auction history price data
 * Run this to see which seasons have NULL winning_bid values
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL); // Main DB for seasons
const auctionSql = neon(process.env.NEON_AUCTION_DB_URL); // Auction DB for rounds/bids

async function diagnoseAuctionPrices() {
  console.log('\n🔍 Diagnosing Auction History Price Data\n');

  try {
    // Check all seasons (from main DB)
    const seasons = await sql`
      SELECT id, name, isActive
      FROM seasons
      WHERE name ~ 'SSPSLS[0-9]+'
      ORDER BY name DESC
    `;

    console.log(`Found ${seasons.length} seasons:\n`);

    for (const season of seasons) {
      const seasonNumber = parseInt(season.name.replace(/\D/g, ''));
      if (seasonNumber < 16) continue; // Skip seasons before S16

      console.log(`\n📊 Season: ${season.name} (${season.isActive ? 'ACTIVE' : 'Completed'})`);
      console.log(`   Season ID: ${season.id}`);

      // Check bulk rounds
      const bulkRoundData = await auctionSql`
        SELECT 
          COUNT(*) as total_players,
          COUNT(*) FILTER (WHERE winning_bid IS NULL) as null_prices,
          COUNT(*) FILTER (WHERE winning_bid = 0) as zero_prices,
          COUNT(*) FILTER (WHERE winning_bid > 0) as valid_prices
        FROM round_players rp
        JOIN rounds r ON rp.round_id = r.id
        WHERE r.season_id = ${season.id}
          AND r.round_type = 'bulk'
          AND rp.status = 'sold'
      `;

      const bulk = bulkRoundData[0];
      if (bulk && bulk.total_players > 0) {
        console.log(`   Bulk Rounds:`);
        console.log(`     Total sold players: ${bulk.total_players}`);
        console.log(`     NULL winning_bid: ${bulk.null_prices} ❌`);
        console.log(`     Zero winning_bid: ${bulk.zero_prices} ${bulk.zero_prices > 0 ? '⚠️' : '✅'}`);
        console.log(`     Valid winning_bid: ${bulk.valid_prices} ${bulk.valid_prices > 0 ? '✅' : '❌'}`);
      } else {
        console.log(`   Bulk Rounds: No sold players`);
      }

      // Check normal rounds
      const normalRoundData = await auctionSql`
        SELECT 
          COUNT(*) as total_bids,
          COUNT(*) FILTER (WHERE amount IS NULL) as null_prices,
          COUNT(*) FILTER (WHERE amount = 0) as zero_prices,
          COUNT(*) FILTER (WHERE amount > 0) as valid_prices
        FROM bids b
        JOIN rounds r ON b.round_id = r.id
        WHERE r.season_id = ${season.id}
          AND r.round_type != 'bulk'
          AND b.status = 'won'
      `;

      const normal = normalRoundData[0];
      if (normal && normal.total_bids > 0) {
        console.log(`   Normal Rounds:`);
        console.log(`     Total winning bids: ${normal.total_bids}`);
        console.log(`     NULL amount: ${normal.null_prices} ${normal.null_prices > 0 ? '❌' : '✅'}`);
        console.log(`     Zero amount: ${normal.zero_prices} ${normal.zero_prices > 0 ? '⚠️' : '✅'}`);
        console.log(`     Valid amount: ${normal.valid_prices} ${normal.valid_prices > 0 ? '✅' : '❌'}`);
      } else {
        console.log(`   Normal Rounds: No winning bids`);
      }

      // Sample players with NULL/0 prices
      const sampleNullPrices = await auctionSql`
        SELECT 
          rp.player_name,
          rp.winning_bid,
          rp.base_price,
          r.round_number,
          r.round_type
        FROM round_players rp
        JOIN rounds r ON rp.round_id = r.id
        WHERE r.season_id = ${season.id}
          AND rp.status = 'sold'
          AND (rp.winning_bid IS NULL OR rp.winning_bid = 0)
        LIMIT 5
      `;

      if (sampleNullPrices.length > 0) {
        console.log(`   \n   Sample players with NULL/0 winning_bid:`);
        for (const player of sampleNullPrices) {
          console.log(`     - ${player.player_name} (Round ${player.round_number}, base: £${player.base_price}): winning_bid = ${player.winning_bid === null ? 'NULL' : player.winning_bid}`);
        }
      }
    }

    console.log('\n\n✅ Diagnosis complete!\n');
    console.log('💡 Recommendations:');
    console.log('   - If NULL winning_bid exists: Run data migration to populate from base_price');
    console.log('   - If 0 winning_bid exists: Check if base_price is also 0 or if finalization failed');
    console.log('   - If valid_prices = 0: Bulk rounds may not have been finalized properly\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

diagnoseAuctionPrices();
