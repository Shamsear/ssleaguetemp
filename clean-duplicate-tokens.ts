import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

async function cleanDuplicateTokens() {
  console.log('🧹 Cleaning duplicate FCM tokens...\n');

  try {
    // Get all active tokens
    const tokens = await sql`
      SELECT 
        id,
        user_id,
        token,
        device_name,
        device_type,
        created_at,
        last_used_at
      FROM fcm_tokens
      WHERE is_active = true
      ORDER BY user_id, device_name, created_at DESC
    `;

    console.log(`📊 Total active tokens: ${tokens.length}\n`);

    // Group by user and device name
    const grouped = new Map<string, Array<any>>();
    
    for (const token of tokens) {
      const key = `${token.user_id}|${token.device_name}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(token);
    }

    let devicesProcessed = 0;
    let tokensRemoved = 0;
    const tokensToRemove: number[] = [];

    for (const [key, deviceTokens] of grouped.entries()) {
      if (deviceTokens.length > 1) {
        const [userId, deviceName] = key.split('|');
        
        // Sort by last_used_at (or created_at if last_used_at is null), keep the most recent
        const sorted = [...deviceTokens].sort((a, b) => {
          const aTime = new Date(a.last_used_at || a.created_at).getTime();
          const bTime = new Date(b.last_used_at || b.created_at).getTime();
          return bTime - aTime;
        });

        const keepToken = sorted[0];
        const removeTokens = sorted.slice(1);

        console.log(`\n🔧 Processing duplicates:`);
        console.log(`   User: ${userId}`);
        console.log(`   Device: ${deviceName}`);
        console.log(`   Keeping: Token ID ${keepToken.id} (last used: ${keepToken.last_used_at || keepToken.created_at})`);
        console.log(`   Removing: ${removeTokens.length} duplicate(s)`);

        for (const token of removeTokens) {
          console.log(`     - Token ID ${token.id} (last used: ${token.last_used_at || token.created_at})`);
          tokensToRemove.push(token.id);
        }

        devicesProcessed++;
        tokensRemoved += removeTokens.length;
      }
    }

    if (tokensToRemove.length > 0) {
      console.log(`\n🗑️  Marking ${tokensToRemove.length} duplicate token(s) as inactive...`);
      
      // Mark duplicates as inactive instead of deleting them
      await sql`
        UPDATE fcm_tokens
        SET is_active = false, updated_at = NOW()
        WHERE id = ANY(${tokensToRemove})
      `;

      console.log(`✅ Successfully deactivated ${tokensToRemove.length} duplicate token(s)`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   Devices processed: ${devicesProcessed}`);
    console.log(`   Duplicate tokens removed: ${tokensRemoved}`);
    console.log(`   Remaining active tokens: ${tokens.length - tokensRemoved}`);
    
    if (tokensRemoved > 0) {
      console.log(`\n✅ Cleanup complete! Users will now receive only one notification per device.`);
    } else {
      console.log(`\n✅ No duplicates found! All tokens are unique.`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
cleanDuplicateTokens()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
