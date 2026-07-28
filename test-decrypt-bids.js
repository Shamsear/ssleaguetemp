/**
 * Test script to verify bid decryption works correctly
 */

import { neon } from '@neondatabase/serverless';
import { decryptBidData } from './lib/encryption.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const auctionSql = neon(process.env.NEON_AUCTION_DB_URL);

async function testDecryption() {
  console.log('\n🔍 Testing bid decryption for SSPSLS16\n');

  try {
    // Get sample winning bids
    const sampleBids = await auctionSql`
      SELECT 
        b.player_id,
        b.amount,
        b.encrypted_bid_data,
        fp.name as player_name,
        t.name as team_name,
        r.round_number
      FROM bids b
      JOIN rounds r ON b.round_id = r.id
      JOIN footballplayers fp ON b.player_id = fp.id
      LEFT JOIN teams t ON b.team_id = t.id
      WHERE b.status = 'won'
        AND r.season_id = 'SSPSLS16'
        AND r.round_type != 'bulk'
      LIMIT 10
    `;

    console.log(`Found ${sampleBids.length} sample winning bids\n`);

    let successCount = 0;
    let failCount = 0;

    for (const bid of sampleBids) {
      console.log(`\n${bid.player_name} → ${bid.team_name}`);
      console.log(`  Round: ${bid.round_number}`);
      console.log(`  Stored amount: ${bid.amount === null ? 'NULL' : '£' + bid.amount}`);

      if (bid.encrypted_bid_data) {
        try {
          const decrypted = decryptBidData(bid.encrypted_bid_data);
          console.log(`  ✅ Decrypted amount: £${decrypted.amount}`);
          console.log(`  Player ID from encrypted data: ${decrypted.player_id}`);
          successCount++;
        } catch (error) {
          console.log(`  ❌ Decryption failed: ${error.message}`);
          failCount++;
        }
      } else {
        console.log(`  ⚠️  No encrypted data available`);
        failCount++;
      }
    }

    console.log(`\n\n📊 Results:`);
    console.log(`  ✅ Successfully decrypted: ${successCount}`);
    console.log(`  ❌ Failed to decrypt: ${failCount}`);

    if (successCount > 0) {
      console.log(`\n✅ Decryption is working! The API should now show correct prices.`);
    } else {
      console.log(`\n❌ Decryption failed for all bids. Check encryption key.`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testDecryption();
