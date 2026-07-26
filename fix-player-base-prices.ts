import { adminDb } from './lib/firebase/admin';
import { getTournamentDb } from './lib/neon/tournament-config';

/**
 * This script updates all players in realplayerstats to have the correct
 * base_price from their category assignment
 */
async function fixPlayerBasePrices() {
  const sql = getTournamentDb();
  console.log('🔧 Fixing player base prices...\n');
  
  try {
    // 1. Load all categories from Firestore
    const categoriesSnapshot = await adminDb.collection('categories').get();
    
    if (categoriesSnapshot.empty) {
      console.log('❌ No categories found in Firestore.');
      return;
    }
    
    const categoryPriceMap = new Map<string, number>();
    
    console.log('📋 Categories loaded:');
    categoriesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && data.base_price !== undefined) {
        // Store with uppercase key since categories are now uppercase
        const categoryKey = data.name.toUpperCase();
        categoryPriceMap.set(categoryKey, data.base_price);
        console.log(`   ${categoryKey}: ${data.base_price} coins`);
      }
    });
    
    console.log('\n🔍 Fetching all players from realplayerstats...\n');
    
    // 2. Get all players from realplayerstats
    const players = await sql`
      SELECT id, player_name, category, base_price, season_id
      FROM realplayerstats
      ORDER BY player_name
    `;
    
    if (players.rows.length === 0) {
      console.log('No players found in realplayerstats.');
      return;
    }
    
    console.log(`Found ${players.rows.length} players\n`);
    
    // 3. Update each player with correct base_price
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const player of players.rows) {
      if (!player.category) {
        console.log(`⚠️  Skipped ${player.player_name}: No category assigned`);
        skippedCount++;
        continue;
      }
      
      const categoryUpper = player.category.toUpperCase();
      const correctPrice = categoryPriceMap.get(categoryUpper);
      
      if (correctPrice === undefined) {
        console.log(`⚠️  Skipped ${player.player_name}: Category "${player.category}" not found in Firestore`);
        skippedCount++;
        continue;
      }
      
      // Only update if the price is different
      if (player.base_price !== correctPrice) {
        try {
          await sql`
            UPDATE realplayerstats
            SET base_price = ${correctPrice}, updated_at = NOW()
            WHERE id = ${player.id}
          `;
          
          console.log(`✅ Updated ${player.player_name}: ${player.category} → ${correctPrice} coins (was: ${player.base_price})`);
          updatedCount++;
        } catch (error) {
          console.error(`❌ Failed to update ${player.player_name}:`, error);
          errorCount++;
        }
      } else {
        // Already correct, skip silently
        skippedCount++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updatedCount} players`);
    console.log(`   ⏭️  Skipped: ${skippedCount} players (already correct or no category)`);
    console.log(`   ❌ Errors: ${errorCount} players`);
    console.log('\n✨ Done!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  }
}

fixPlayerBasePrices()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
