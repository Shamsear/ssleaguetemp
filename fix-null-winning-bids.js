/**
 * Fix NULL winning_bid values in round_players table
 * Sets winning_bid = base_price for sold players where winning_bid is NULL
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const auctionSql = neon(process.env.NEON_AUCTION_DB_URL);

async function fixNullWinningBids() {
  console.log('\n🔧 Fixing NULL winning_bid values in round_players\n');

  try {
    // First, check how many records need fixing
    const checkQuery = await auctionSql`
      SELECT COUNT(*) as count
      FROM round_players
      WHERE status = 'sold'
        AND winning_bid IS NULL
    `;

    const nullCount = parseInt(checkQuery[0]?.count || '0');
    console.log(`Found ${nullCount} sold players with NULL winning_bid\n`);

    if (nullCount === 0) {
      console.log('✅ No records need fixing!');
      return;
    }

    // Show sample records before fix
    const sample = await auctionSql`
      SELECT 
        rp.player_id,
        rp.player_name,
        rp.winning_bid,
        rp.base_price,
        r.round_number,
        r.season_id
      FROM round_players rp
      JOIN rounds r ON rp.round_id = r.id
      WHERE rp.status = 'sold'
        AND rp.winning_bid IS NULL
      LIMIT 10
    `;

    console.log('Sample records before fix:');
    for (const record of sample) {
      console.log(`  - ${record.player_name} (Season: ${record.season_id}, Round: ${record.round_number})`);
      console.log(`    winning_bid: NULL → will be set to base_price: £${record.base_price}`);
    }

    console.log('\n🔄 Applying fix...\n');

    // Fix the NULL winning_bid values by setting them to base_price
    const updateResult = await auctionSql`
      UPDATE round_players
      SET winning_bid = base_price
      WHERE status = 'sold'
        AND winning_bid IS NULL
        AND base_price IS NOT NULL
    `;

    console.log(`✅ Updated ${updateResult.length || nullCount} records\n`);

    // Verify the fix
    const verifyQuery = await auctionSql`
      SELECT COUNT(*) as count
      FROM round_players
      WHERE status = 'sold'
        AND winning_bid IS NULL
    `;

    const remainingNull = parseInt(verifyQuery[0]?.count || '0');
    console.log(`Remaining NULL winning_bid values: ${remainingNull}`);

    if (remainingNull > 0) {
      console.log('\n⚠️  Some records still have NULL winning_bid. Checking...');
      const remaining = await auctionSql`
        SELECT 
          player_name,
          base_price,
          winning_bid
        FROM round_players
        WHERE status = 'sold'
          AND winning_bid IS NULL
        LIMIT 5
      `;

      for (const record of remaining) {
        console.log(`  - ${record.player_name}: base_price=${record.base_price}, winning_bid=${record.winning_bid}`);
      }
    } else {
      console.log('✅ All sold players now have winning_bid values!');
    }

    console.log('\n✅ Fix complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixNullWinningBids();
