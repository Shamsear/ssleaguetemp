import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

async function checkDuplicateTokens() {
  console.log('🔍 Checking for duplicate FCM tokens...\n');

  try {
    // Get all active tokens
    const tokens = await sql`
      SELECT 
        user_id,
        token,
        device_name,
        device_type,
        browser,
        os,
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

    let duplicatesFound = 0;
    let totalDuplicateTokens = 0;

    for (const [key, deviceTokens] of grouped.entries()) {
      if (deviceTokens.length > 1) {
        duplicatesFound++;
        totalDuplicateTokens += deviceTokens.length - 1;
        
        const [userId, deviceName] = key.split('|');
        console.log(`\n⚠️  Duplicate tokens found:`);
        console.log(`   User: ${userId}`);
        console.log(`   Device: ${deviceName}`);
        console.log(`   Token count: ${deviceTokens.length}`);
        console.log(`   Tokens:`);
        
        deviceTokens.forEach((t, idx) => {
          console.log(`     ${idx + 1}. Created: ${t.created_at}, Last used: ${t.last_used_at}`);
          console.log(`        Token: ${t.token.substring(0, 20)}...`);
        });
        
        // Show which ones should be removed (keep the most recently used)
        const sorted = [...deviceTokens].sort((a, b) => 
          new Date(b.last_used_at || b.created_at).getTime() - 
          new Date(a.last_used_at || a.created_at).getTime()
        );
        
        console.log(`\n   💡 Suggestion: Keep token #${deviceTokens.indexOf(sorted[0]) + 1} (most recently used)`);
        console.log(`   💡 Remove ${deviceTokens.length - 1} duplicate token(s)`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   Total active tokens: ${tokens.length}`);
    console.log(`   Devices with duplicates: ${duplicatesFound}`);
    console.log(`   Total duplicate tokens: ${totalDuplicateTokens}`);
    
    if (duplicatesFound > 0) {
      console.log(`\n⚠️  Found ${duplicatesFound} device(s) with duplicate tokens!`);
      console.log(`   This causes users to receive multiple copies of the same notification.`);
      console.log(`\n💡 Run 'npx tsx clean-duplicate-tokens.ts' to remove duplicates.`);
    } else {
      console.log(`\n✅ No duplicate tokens found! Each device has only one token.`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
checkDuplicateTokens()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
