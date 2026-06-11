import { fantasySql } from '../lib/neon/fantasy-config';
import { getTournamentDb } from '../lib/neon/tournament-config';

/**
 * Migration Script: Fantasy League Category-Based Pricing
 * 
 * Changes:
 * 1. Add category_prices to fantasy_leagues
 * 2. Add category column to fantasy_players, fantasy_squad, fantasy_drafts
 * 3. Add drafted_by_team_id to fantasy_players for single ownership
 * 4. Migrate existing data from star_rating to category
 */

async function migrateToCategoryPricing() {
  console.log('🔄 Starting fantasy league category pricing migration...\n');

  try {
    // Step 1: Add category_prices column to fantasy_leagues
    console.log('📊 Step 1: Adding category_prices to fantasy_leagues...');
    await fantasySql`
      ALTER TABLE fantasy_leagues 
      ADD COLUMN IF NOT EXISTS category_prices JSONB DEFAULT '[
        {"category": "A", "price": 40.00},
        {"category": "B", "price": 25.00},
        {"category": "C", "price": 15.00},
        {"category": "D", "price": 10.00},
        {"category": "E", "price": 5.00}
      ]'::jsonb
    `;
    console.log('✅ category_prices column added\n');

    // Step 2: Update existing leagues with category prices
    console.log('📊 Step 2: Updating existing leagues with category prices...');
    const leaguesUpdated = await fantasySql`
      UPDATE fantasy_leagues
      SET category_prices = '[
        {"category": "A", "price": 40.00},
        {"category": "B", "price": 25.00},
        {"category": "C", "price": 15.00},
        {"category": "D", "price": 10.00},
        {"category": "E", "price": 5.00}
      ]'::jsonb
      WHERE category_prices IS NULL
      RETURNING league_id
    `;
    console.log(`✅ Updated ${leaguesUpdated.length} leagues\n`);

    // Step 3: Add columns to fantasy_players
    console.log('📊 Step 3: Adding columns to fantasy_players...');
    await fantasySql`
      ALTER TABLE fantasy_players
      ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A'
    `;
    await fantasySql`
      ALTER TABLE fantasy_players
      ADD COLUMN IF NOT EXISTS drafted_by_team_id VARCHAR(100)
    `;
    console.log('✅ Columns added to fantasy_players\n');

    // Step 4: Add index for faster lookups
    console.log('📊 Step 4: Creating indexes...');
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_players_drafted 
      ON fantasy_players(league_id, drafted_by_team_id)
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_players_category
      ON fantasy_players(league_id, category)
    `;
    console.log('✅ Indexes created\n');

    // Step 5: Add category to fantasy_squad
    console.log('📊 Step 5: Adding category to fantasy_squad...');
    await fantasySql`
      ALTER TABLE fantasy_squad
      ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A'
    `;
    console.log('✅ Category added to fantasy_squad\n');

    // Step 6: Add category to fantasy_drafts
    console.log('📊 Step 6: Adding category to fantasy_drafts...');
    await fantasySql`
      ALTER TABLE fantasy_drafts
      ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A'
    `;
    console.log('✅ Category added to fantasy_drafts\n');

    // Step 7: Migrate category data from player_seasons to fantasy_players
    console.log('📊 Step 7: Migrating category data from player_seasons...');
    const tournamentSql = getTournamentDb();
    
    // Get all fantasy leagues
    const leagues = await fantasySql`SELECT league_id, season_id FROM fantasy_leagues`;
    
    for (const league of leagues) {
      console.log(`  Processing league ${league.league_id}...`);
      
      // Get players from player_seasons for this season
      const players = await tournamentSql`
        SELECT player_id, category
        FROM player_seasons
        WHERE season_id = ${league.season_id}
          AND category IS NOT NULL
      `;

      if (players.length === 0) {
        console.log(`  ⚠️  No players found for ${league.league_id}`);
        continue;
      }

      // Bulk update using temporary values table (much faster than loop)
      const playerIds = players.map((p: any) => p.player_id);
      const categories = players.map((p: any) => p.category);

      await fantasySql`
        UPDATE fantasy_players fp
        SET category = v.category
        FROM (
          SELECT 
            unnest(${playerIds}::varchar[]) as player_id,
            unnest(${categories}::varchar[]) as category
        ) v
        WHERE fp.league_id = ${league.league_id}
          AND fp.real_player_id = v.player_id
      `;
      
      console.log(`  ✅ Updated ${players.length} players in ${league.league_id}`);
    }
    console.log('✅ Category data migrated\n');

    // Step 8: Set drafted_by_team_id for currently drafted players
    console.log('📊 Step 8: Setting drafted_by_team_id for drafted players...');
    
    // Get all fantasy_squad entries (these are drafted players)
    const draftedPlayers = await fantasySql`
      SELECT DISTINCT 
        fs.league_id,
        fs.real_player_id,
        fs.team_id,
        fs.category
      FROM fantasy_squad fs
    `;
    
    console.log(`  Found ${draftedPlayers.length} drafted players`);
    
    if (draftedPlayers.length > 0) {
      // Bulk update using temporary values table
      const leagueIds = draftedPlayers.map((p: any) => p.league_id);
      const playerIds = draftedPlayers.map((p: any) => p.real_player_id);
      const teamIds = draftedPlayers.map((p: any) => p.team_id);
      const categories = draftedPlayers.map((p: any) => p.category);

      await fantasySql`
        UPDATE fantasy_players fp
        SET drafted_by_team_id = v.team_id,
            is_available = false,
            category = COALESCE(fp.category, v.category)
        FROM (
          SELECT 
            unnest(${leagueIds}::varchar[]) as league_id,
            unnest(${playerIds}::varchar[]) as player_id,
            unnest(${teamIds}::varchar[]) as team_id,
            unnest(${categories}::varchar[]) as category
        ) v
        WHERE fp.league_id = v.league_id
          AND fp.real_player_id = v.player_id
      `;
    }
    
    console.log(`✅ Updated ${draftedPlayers.length} players as drafted\n`);

    // Step 9: Update fantasy_squad with category from fantasy_players
    console.log('📊 Step 9: Updating fantasy_squad with category...');
    await fantasySql`
      UPDATE fantasy_squad fs
      SET category = fp.category
      FROM fantasy_players fp
      WHERE fs.league_id = fp.league_id
        AND fs.real_player_id = fp.real_player_id
        AND fp.category IS NOT NULL
    `;
    console.log('✅ fantasy_squad updated with categories\n');

    // Step 10: Update fantasy_drafts with category from fantasy_players
    console.log('📊 Step 10: Updating fantasy_drafts with category...');
    await fantasySql`
      UPDATE fantasy_drafts fd
      SET category = fp.category
      FROM fantasy_players fp
      WHERE fd.league_id = fp.league_id
        AND fd.real_player_id = fp.real_player_id
        AND fp.category IS NOT NULL
    `;
    console.log('✅ fantasy_drafts updated with categories\n');

    // Summary
    console.log('═══════════════════════════════════════════');
    console.log('✅ Migration completed successfully!\n');
    console.log('Summary of changes:');
    console.log('  ✓ Added category_prices to fantasy_leagues');
    console.log('  ✓ Added category and drafted_by_team_id to fantasy_players');
    console.log('  ✓ Added category to fantasy_squad and fantasy_drafts');
    console.log('  ✓ Created indexes for performance');
    console.log('  ✓ Migrated all existing data');
    console.log('  ✓ Set drafted_by_team_id for drafted players');
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
migrateToCategoryPricing()
  .then(() => {
    console.log('✅ Migration script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
