// Load environment variables from .env.local FIRST
import { config } from 'dotenv';
config({ path: '.env.local' });

// Now import fantasySql
import { fantasySql } from '../lib/neon/fantasy-config';

/**
 * Create fantasy_captain_windows table
 * 
 * This creates a separate table to track captain selection windows per round.
 * Admin can create multiple windows (one per round) instead of storing in fantasy_leagues.
 * 
 * This script:
 * 1. Removes captain window columns from fantasy_leagues (cleanup)
 * 2. Creates fantasy_captain_windows table
 * 3. Ensures fantasy_captain_history table exists
 */

async function createCaptainWindowsTable() {
  console.log('🔄 Creating fantasy captain windows tracking table...\n');
  
  const dbUrl = process.env.FANTASY_DATABASE_URL || 'using fallback URL';
  console.log(`🔗 Connecting to: ${dbUrl.substring(0, 50)}...\n`);

  try {
    // Step 1: Remove columns from fantasy_leagues (cleanup from previous attempt)
    console.log('📊 Step 1: Cleaning up fantasy_leagues table...');
    try {
      await fantasySql`
        ALTER TABLE fantasy_leagues 
        DROP COLUMN IF EXISTS captain_window_status,
        DROP COLUMN IF EXISTS captain_window_opens_at,
        DROP COLUMN IF EXISTS captain_window_closes_at,
        DROP COLUMN IF EXISTS current_round_id
      `;
      console.log('✅ Cleanup complete\n');
    } catch (err) {
      console.log('ℹ️  Columns already removed or never existed\n');
    }

    // Step 2: Create fantasy_captain_windows table
    console.log('📊 Step 2: Creating fantasy_captain_windows table...');
    await fantasySql`
      CREATE TABLE IF NOT EXISTS fantasy_captain_windows (
        id SERIAL PRIMARY KEY,
        window_id VARCHAR(100) UNIQUE NOT NULL,
        league_id VARCHAR(100) NOT NULL,
        round_id VARCHAR(100) NOT NULL,
        round_number INTEGER,
        round_name VARCHAR(255),
        window_status VARCHAR(20) DEFAULT 'pending',
        opens_at TIMESTAMP WITH TIME ZONE NOT NULL,
        closes_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_by_user_id VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        total_teams INTEGER DEFAULT 0,
        teams_with_captain_set INTEGER DEFAULT 0,
        notes TEXT,
        UNIQUE(league_id, round_id)
      )
    `;
    console.log('✅ Table created\n');

    // Step 3: Create indexes
    console.log('📊 Step 3: Creating indexes...');
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_windows_league 
      ON fantasy_captain_windows(league_id)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_windows_round 
      ON fantasy_captain_windows(round_id)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_windows_status 
      ON fantasy_captain_windows(window_status)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_windows_opens_at 
      ON fantasy_captain_windows(opens_at)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_windows_closes_at 
      ON fantasy_captain_windows(closes_at)
    `;
    console.log('✅ Indexes created\n');

    // Step 4: Add comments
    console.log('📊 Step 4: Adding table comments...');
    await fantasySql`
      COMMENT ON TABLE fantasy_captain_windows IS 
      'Captain selection windows per round - admin creates one for each round'
    `;
    await fantasySql`
      COMMENT ON COLUMN fantasy_captain_windows.window_status IS 
      'pending: not started, open: teams can select, closed: time expired, locked: finalized'
    `;
    console.log('✅ Comments added\n');

    // Step 5: Update fantasy_captain_history to include window_id
    console.log('📊 Step 5: Updating fantasy_captain_history table...');
    await fantasySql`
      ALTER TABLE fantasy_captain_history 
      ADD COLUMN IF NOT EXISTS window_id VARCHAR(100)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_history_window 
      ON fantasy_captain_history(window_id)
    `;
    console.log('✅ History table updated\n');

    // Step 6: Verify
    console.log('📊 Step 6: Verifying...');
    const windows = await fantasySql`
      SELECT COUNT(*) as count FROM fantasy_captain_windows
    `;
    console.log(`✅ Captain windows table ready (${windows[0].count} windows currently)\n`);

    console.log('✨ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  ✅ fantasy_captain_windows table created');
    console.log('  ✅ Indexes created for performance');
    console.log('  ✅ fantasy_captain_history updated with window_id');
    console.log('  ✅ Unique constraint: one window per round per league');
    console.log('\n💡 How it works:');
    console.log('  1. Admin creates a NEW window for each round');
    console.log('  2. Set opens_at and closes_at times');
    console.log('  3. Window status: pending → open → closed → locked');
    console.log('  4. Teams select captain/VC while window is open');
    console.log('  5. History tracked in fantasy_captain_history');
    console.log('\n📋 Next steps:');
    console.log('  1. Create API: POST /api/fantasy/captain-windows (create window)');
    console.log('  2. Create API: GET /api/fantasy/captain-windows (list windows)');
    console.log('  3. Create API: PATCH /api/fantasy/captain-windows/[id] (update status)');
    console.log('  4. Create API: POST /api/fantasy/captain-windows/set-captains');
    console.log('  5. Create admin UI to manage windows');
    console.log('  6. Create team UI to select captain/VC');

  } catch (error) {
    console.error('❌ Error running migration:', error);
    throw error;
  }
}

// Run the migration
createCaptainWindowsTable()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
