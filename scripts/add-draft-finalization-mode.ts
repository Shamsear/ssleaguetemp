// Load environment variables from .env.local FIRST (before any imports that use them)
import { config } from 'dotenv';
config({ path: '.env.local' });

// Now import fantasySql (which will use the loaded environment variables)
import { fantasySql } from '../lib/neon/fantasy-config';

/**
 * Add draft_finalization_mode to fantasy_leagues table
 * 
 * This script adds:
 * 1. draft_finalization_mode column (VARCHAR(20), default 'auto')
 * 2. Index for performance
 * 3. Updates existing leagues to 'auto' mode
 */

async function addDraftFinalizationMode() {
  console.log('🔄 Adding draft finalization mode to fantasy leagues...\n');
  
  // Show which database we're connecting to
  const dbUrl = process.env.FANTASY_DATABASE_URL || 'using fallback URL';
  console.log(`🔗 Connecting to: ${dbUrl.substring(0, 50)}...\n`);

  try {
    // Step 1: Add draft_finalization_mode column
    console.log('📊 Step 1: Adding draft_finalization_mode column...');
    await fantasySql`
      ALTER TABLE fantasy_leagues 
      ADD COLUMN IF NOT EXISTS draft_finalization_mode VARCHAR(20) DEFAULT 'auto'
    `;
    console.log('✅ Column added successfully\n');

    // Step 2: Add comment to document the column
    console.log('📊 Step 2: Adding column comment...');
    await fantasySql`
      COMMENT ON COLUMN fantasy_leagues.draft_finalization_mode IS 
      'Finalization mode: auto (automatic finalization when draft closes) or manual (requires admin confirmation)'
    `;
    console.log('✅ Comment added\n');

    // Step 3: Create index for faster lookups
    console.log('📊 Step 3: Creating index...');
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_leagues_finalization_mode 
      ON fantasy_leagues(draft_finalization_mode)
    `;
    console.log('✅ Index created\n');

    // Step 4: Update existing leagues to use 'auto' mode (default behavior)
    console.log('📊 Step 4: Updating existing leagues...');
    const result = await fantasySql`
      UPDATE fantasy_leagues 
      SET draft_finalization_mode = 'auto' 
      WHERE draft_finalization_mode IS NULL
    `;
    console.log(`✅ Updated ${result.length} league(s)\n`);

    // Step 5: Verify the changes
    console.log('📊 Step 5: Verifying changes...');
    const leagues = await fantasySql`
      SELECT league_id, season_name, draft_status, draft_finalization_mode 
      FROM fantasy_leagues 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    
    console.log('✅ Verification successful!\n');
    console.log('📋 Current leagues:');
    if (leagues.length === 0) {
      console.log('  (No leagues found)');
    } else {
      leagues.forEach((league: any) => {
        console.log(`  - ${league.season_name} (${league.league_id})`);
        console.log(`    Status: ${league.draft_status}`);
        console.log(`    Finalization Mode: ${league.draft_finalization_mode || 'NULL'}`);
      });
    }

    console.log('\n✨ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  ✅ draft_finalization_mode column added');
    console.log('  ✅ Index created for performance');
    console.log('  ✅ All existing leagues set to "auto" mode');
    console.log('\n💡 Next steps:');
    console.log('  1. Deploy code changes');
    console.log('  2. Test mode toggle in admin UI');
    console.log('  3. Test auto finalization');
    console.log('  4. Test manual finalization with preview');

  } catch (error) {
    console.error('❌ Error running migration:', error);
    throw error;
  }
}

// Run the migration
addDraftFinalizationMode()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
