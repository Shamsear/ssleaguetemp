import { sql } from '@vercel/postgres';

async function checkRealPlayerPrices() {
  console.log('🔍 Checking real player base prices...\n');
  
  try {
    // Check a sample of players with their base prices
    const result = await sql`
      SELECT 
        player_name, 
        category, 
        base_price,
        price,
        team_id
      FROM realplayerstats 
      WHERE base_price > 0
      ORDER BY base_price DESC
      LIMIT 20
    `;
    
    if (result.rows.length === 0) {
      console.log('No players found with base prices.');
      return;
    }
    
    console.log('📊 Sample of Real Players with Base Prices:\n');
    console.log('Player Name'.padEnd(25), 'Category'.padEnd(10), 'Base Price'.padEnd(12), 'Price'.padEnd(8), 'Team');
    console.log('-'.repeat(80));
    
    result.rows.forEach(row => {
      console.log(
        (row.player_name || 'N/A').substring(0, 24).padEnd(25),
        (row.category || 'N/A').padEnd(10),
        (row.base_price !== null ? row.base_price : 'null').toString().padEnd(12),
        (row.price !== null ? row.price : 'null').toString().padEnd(8),
        row.team_id || 'none'
      );
    });
    
    // Check the distribution of base prices
    const distribution = await sql`
      SELECT 
        base_price,
        COUNT(*) as count
      FROM realplayerstats 
      WHERE base_price > 0
      GROUP BY base_price
      ORDER BY base_price DESC
    `;
    
    console.log('\n📊 Base Price Distribution:\n');
    console.log('Base Price'.padEnd(15), 'Player Count');
    console.log('-'.repeat(30));
    
    distribution.rows.forEach(row => {
      console.log(
        row.base_price.toString().padEnd(15),
        row.count
      );
    });
    
    console.log('\n✅ Check complete!');
  } catch (error) {
    console.error('❌ Error checking real player prices:', error);
  }
}

checkRealPlayerPrices()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
