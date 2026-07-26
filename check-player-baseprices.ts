import { getTournamentDb } from './lib/neon/tournament-config';

async function checkPlayerBasePrices() {
  const sql = getTournamentDb();
  
  console.log('🔍 Checking player base prices in realplayerstats...\n');
  
  try {
    // Check sample of players with their base prices
    const result = await sql`
      SELECT 
        player_name, 
        category, 
        base_price,
        price,
        team_id,
        season_id
      FROM realplayerstats 
      WHERE category IS NOT NULL
      ORDER BY player_name
      LIMIT 20
    `;
    
    console.log('📊 Sample Players:\n');
    console.log('Player'.padEnd(25), 'Category'.padEnd(10), 'Base Price'.padEnd(12), 'Price');
    console.log('-'.repeat(70));
    
    result.forEach((row: any) => {
      console.log(
        (row.player_name || 'N/A').substring(0, 24).padEnd(25),
        (row.category || 'N/A').padEnd(10),
        (row.base_price !== null ? row.base_price : 'NULL').toString().padEnd(12),
        (row.price !== null ? row.price : 'NULL')
      );
    });
    
    // Count by category
    const categoryCount = await sql`
      SELECT 
        category,
        COUNT(*) as total,
        COUNT(CASE WHEN base_price IS NULL OR base_price = 0 THEN 1 END) as missing_price
      FROM realplayerstats 
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY category
    `;
    
    console.log('\n📊 Category Summary:\n');
    console.log('Category'.padEnd(15), 'Total'.padEnd(10), 'Missing Price');
    console.log('-'.repeat(45));
    
    categoryCount.forEach((row: any) => {
      console.log(
        (row.category || 'N/A').padEnd(15),
        row.total.toString().padEnd(10),
        row.missing_price
      );
    });
    
    console.log('\n✅ Check complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkPlayerBasePrices()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
