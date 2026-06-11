import { fantasySql } from '../lib/neon/fantasy-config';

/**
 * Add Database Constraints and Indexes for Fantasy League
 * 
 * This script adds:
 * 1. Budget non-negative constraint
 * 2. Unique ownership constraint
 * 3. Additional performance indexes
 */

async function addConstraints() {
  console.log('🔄 Adding database constraints and indexes...\n');

  try {
    // Step 1: Add budget constraint
    console.log('📊 Step 1: Adding budget non-negative constraint...');
    try {
      await fantasySql`
        ALTER TABLE fantasy_teams
        ADD CONSTRAINT chk_budget_non_negative 
        CHECK (budget_remaining >= 0)
      `;
      console.log('✅ Budget constraint added\n');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('⚠️ Budget constraint already exists, skipping\n');
      } else {
        throw error;
      }
    }

    // Step 2: Add unique ownership constraint
    console.log('📊 Step 2: Adding unique ownership constraint...');
    await fantasySql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_players_unique_owner
      ON fantasy_players(league_id, real_player_id)
      WHERE drafted_by_team_id IS NOT NULL
    `;
    console.log('✅ Unique ownership constraint added\n');

    // Step 3: Add missing indexes for performance
    console.log('📊 Step 3: Adding performance indexes...');
    
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_players_available 
      ON fantasy_players(league_id, is_available)
    `;
    console.log('  ✓ Index on is_available created');

    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_squad_team
      ON fantasy_squad(team_id, league_id)
    `;
    console.log('  ✓ Index on fantasy_squad.team_id created');

    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_drafts_team
      ON fantasy_drafts(team_id, league_id)
    `;
    console.log('  ✓ Index on fantasy_drafts.team_id created');

    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_players_league_player
      ON fantasy_players(league_id, real_player_id)
    `;
    console.log('  ✓ Index on fantasy_players lookup created');

    console.log('✅ All indexes created\n');

    // Step 4: Verify constraints
    console.log('📊 Step 4: Verifying constraints...');
    
    const constraints = await fantasySql`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'fantasy_teams'::regclass
        AND conname = 'chk_budget_non_negative'
    `;

    if (constraints.length > 0) {
      console.log('✅ Budget constraint verified\n');
    } else {
      console.log('⚠️ Budget constraint not found (may have different name)\n');
    }

    // Step 5: Verify indexes
    console.log('📊 Step 5: Verifying indexes...');
    
    const indexes = await fantasySql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename IN ('fantasy_players', 'fantasy_teams', 'fantasy_squad', 'fantasy_drafts')
        AND indexname LIKE 'idx_fantasy%'
      ORDER BY indexname
    `;

    console.log(`✅ Found ${indexes.length} fantasy indexes:`);
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.indexname}`);
    });
    console.log();

    // Summary
    console.log('═══════════════════════════════════════════');
    console.log('✅ All constraints and indexes added successfully!\n');
    console.log('Summary:');
    console.log('  ✓ Budget non-negative constraint');
    console.log('  ✓ Unique player ownership constraint');
    console.log('  ✓ Performance indexes (5 new indexes)');
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Failed to add constraints:', error);
    throw error;
  }
}

// Run the script
addConstraints()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
