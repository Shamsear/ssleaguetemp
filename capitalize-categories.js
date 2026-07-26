/**
 * Script to capitalize all category values in the database
 * Runs on both player_seasons (S16/S17) and realplayerstats (S18+) tables
 */

const { getTournamentDb } = require('./lib/neon/tournament-config');

async function capitalizeCategories() {
  const sql = getTournamentDb();

  console.log('🔄 Starting category capitalization...\n');

  try {
    // 1. Update player_seasons table (S16/S17)
    console.log('📊 Updating player_seasons table...');
    const playerSeasonsResult = await sql`
      UPDATE player_seasons
      SET 
        category = CASE
          WHEN LOWER(category) = 'legend' THEN 'LEGEND'
          WHEN LOWER(category) = 'classic' THEN 'CLASSIC'
          WHEN LOWER(category) = 'gold' THEN 'GOLD'
          WHEN LOWER(category) = 'silver' THEN 'SILVER'
          WHEN LOWER(category) = 'bronze' THEN 'BRONZE'
          WHEN LOWER(category) = 'rising star' THEN 'RISING STAR'
          WHEN LOWER(category) = 'veteran' THEN 'VETERAN'
          ELSE UPPER(category)
        END,
        updated_at = NOW()
      WHERE category IS NOT NULL
        AND category != CASE
          WHEN LOWER(category) = 'legend' THEN 'LEGEND'
          WHEN LOWER(category) = 'classic' THEN 'CLASSIC'
          WHEN LOWER(category) = 'gold' THEN 'GOLD'
          WHEN LOWER(category) = 'silver' THEN 'SILVER'
          WHEN LOWER(category) = 'bronze' THEN 'BRONZE'
          WHEN LOWER(category) = 'rising star' THEN 'RISING STAR'
          WHEN LOWER(category) = 'veteran' THEN 'VETERAN'
          ELSE UPPER(category)
        END
      RETURNING id, category
    `;
    console.log(`✅ Updated ${playerSeasonsResult.length} rows in player_seasons\n`);

    // 2. Update realplayerstats table (S18+)
    console.log('📊 Updating realplayerstats table...');
    const realPlayerStatsResult = await sql`
      UPDATE realplayerstats
      SET 
        category = CASE
          WHEN LOWER(category) = 'legend' THEN 'LEGEND'
          WHEN LOWER(category) = 'classic' THEN 'CLASSIC'
          WHEN LOWER(category) = 'gold' THEN 'GOLD'
          WHEN LOWER(category) = 'silver' THEN 'SILVER'
          WHEN LOWER(category) = 'bronze' THEN 'BRONZE'
          WHEN LOWER(category) = 'rising star' THEN 'RISING STAR'
          WHEN LOWER(category) = 'veteran' THEN 'VETERAN'
          ELSE UPPER(category)
        END,
        updated_at = NOW()
      WHERE category IS NOT NULL
        AND category != CASE
          WHEN LOWER(category) = 'legend' THEN 'LEGEND'
          WHEN LOWER(category) = 'classic' THEN 'CLASSIC'
          WHEN LOWER(category) = 'gold' THEN 'GOLD'
          WHEN LOWER(category) = 'silver' THEN 'SILVER'
          WHEN LOWER(category) = 'bronze' THEN 'BRONZE'
          WHEN LOWER(category) = 'rising star' THEN 'RISING STAR'
          WHEN LOWER(category) = 'veteran' THEN 'VETERAN'
          ELSE UPPER(category)
        END
      RETURNING id, category
    `;
    console.log(`✅ Updated ${realPlayerStatsResult.length} rows in realplayerstats\n`);

    // 3. Show summary of categories in both tables
    console.log('📋 Category summary in player_seasons:');
    const playerSeasonsSummary = await sql`
      SELECT category, COUNT(*) as count
      FROM player_seasons
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `;
    playerSeasonsSummary.forEach(row => {
      console.log(`   ${row.category}: ${row.count} players`);
    });

    console.log('\n📋 Category summary in realplayerstats:');
    const realPlayerStatsSummary = await sql`
      SELECT category, COUNT(*) as count
      FROM realplayerstats
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `;
    realPlayerStatsSummary.forEach(row => {
      console.log(`   ${row.category}: ${row.count} players`);
    });

    console.log('\n✅ Category capitalization complete!');
  } catch (error) {
    console.error('❌ Error capitalizing categories:', error);
    throw error;
  }
}

// Run the script
capitalizeCategories()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
