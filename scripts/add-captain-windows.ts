// Load environment variables from .env.local FIRST
import { config } from 'dotenv';
config({ path: '.env.local' });

// Now import fantasySql
import { fantasySql } from '../lib/neon/fantasy-config';

/**
 * Add captain selection windows to fantasy leagues
 * 
 * This script adds:
 * 1. captain_window_status (VARCHAR(20), default 'closed')
 * 2. captain_window_opens_at (TIMESTAMP WITH TIME ZONE)
 * 3. captain_window_closes_at (TIMESTAMP WITH TIME ZONE)
 * 4. current_round_id (VARCHAR(100))
 * 5. fantasy_captain_history table for audit trail
 */

async function addCaptainWindows() {
  console.log('🔄 Adding captain selection windows to fantasy leagues...\n');
  
  const dbUrl = process.env.FANTASY_DATABASE_URL || 'using fallback URL';
  console.log(`🔗 Connecting to: ${dbUrl.substring(0, 50)}...\n`);

  try {
    // Step 1: Add captain window fields to fantasy_leagues
    console.log('📊 Step 1: Adding captain window fields to fantasy_leagues...');
    await fantasySql`
      ALTER TABLE fantasy_leagues 
      ADD COLUMN IF NOT EXISTS captain_window_status VARCHAR(20) DEFAULT 'closed',
      ADD COLUMN IF NOT EXISTS captain_window_opens_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS captain_window_closes_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS current_round_id VARCHAR(100)
    `;
    console.log('✅ Columns added successfully\n');

    // Step 2: Add comments
    console.log('📊 Step 2: Adding column comments...');
    await fantasySql`
      COMMENT ON COLUMN fantasy_leagues.captain_window_status IS 
      'Status of captain selection window: closed, open, locked'
    `;
    await fantasySql`
      COMMENT ON COLUMN fantasy_leagues.captain_window_opens_at IS 
      'When teams can start selecting captain/VC'
    `;
    await fantasySql`
      COMMENT ON COLUMN fantasy_leagues.captain_window_closes_at IS 
      'Deadline for captain/VC selection'
    `;
    await fantasySql`
      COMMENT ON COLUMN fantasy_leagues.current_round_id IS 
      'Current active round for captain selection'
    `;
    console.log('✅ Comments added\n');

    // Step 3: Create indexes
    console.log('📊 Step 3: Creating indexes...');
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_leagues_captain_window_status 
      ON fantasy_leagues(captain_window_status)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_leagues_current_round 
      ON fantasy_leagues(current_round_id)
    `;
    console.log('✅ Indexes created\n');

    // Step 4: Create fantasy_captain_history table
    console.log('📊 Step 4: Creating fantasy_captain_history table...');
    await fantasySql`
      CREATE TABLE IF NOT EXISTS fantasy_captain_history (
        id SERIAL PRIMARY KEY,
        history_id VARCHAR(100) UNIQUE NOT NULL,
        league_id VARCHAR(100) NOT NULL,
        team_id VARCHAR(100) NOT NULL,
        round_id VARCHAR(100),
        captain_player_id VARCHAR(100),
        vice_captain_player_id VARCHAR(100),
        changed_by_user_id VARCHAR(100) NOT NULL,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        window_opens_at TIMESTAMP WITH TIME ZONE,
        window_closes_at TIMESTAMP WITH TIME ZONE,
        notes TEXT
      )
    `;
    console.log('✅ Table created\n');

    // Step 5: Create indexes for history table
    console.log('📊 Step 5: Creating indexes for history table...');
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_history_league 
      ON fantasy_captain_history(league_id)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_history_team 
      ON fantasy_captain_history(team_id)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_history_round 
      ON fantasy_captain_history(round_id)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_captain_history_changed_at 
      ON fantasy_captain_history(changed_at DESC)
    `;
    console.log('✅ Indexes created\n');

    // Step 6: Verify the changes
    console.log('📊 Step 6: Verifying changes...');
    const leagues = await fantasySql`
      SELECT 
        league_id, 
        season_name, 
        captain_window_status,
        captain_window_opens_at,
        captain_window_closes_at,
        current_round_id
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
        console.log(`    Captain Window Status: ${league.captain_window_status}`);
        console.log(`    Opens At: ${league.captain_window_opens_at || 'Not set'}`);
        console.log(`    Closes At: ${league.captain_window_closes_at || 'Not set'}`);
        console.log(`    Current Round: ${league.current_round_id || 'Not set'}`);
      });
    }

    console.log('\n✨ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  ✅ Captain window fields added to fantasy_leagues');
    console.log('  ✅ fantasy_captain_history table created');
    console.log('  ✅ Indexes created for performance');
    console.log('  ✅ All existing leagues set to "closed" status');
    console.log('\n💡 Next steps:');
    console.log('  1. Create API endpoints for captain window management');
    console.log('  2. Create admin UI to open/close windows');
    console.log('  3. Create team UI to select captain/VC');
    console.log('  4. Test window restrictions');

  } catch (error) {
    console.error('❌ Error running migration:', error);
    throw error;
  }
}

// Run the migration
addCaptainWindows()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
