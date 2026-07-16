import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

async function makeTournamentNullable() {
  console.log('🔧 Altering realplayerstats table to make tournament_id nullable...');
  
  try {
    // 1. Drop constraints
    console.log('   - Dropping old constraints...');
    await sql`
      ALTER TABLE realplayerstats 
      DROP CONSTRAINT IF EXISTS fk_realplayerstats_tournament
    `;
    await sql`
      ALTER TABLE realplayerstats 
      DROP CONSTRAINT IF EXISTS unique_player_season
    `;
    await sql`
      ALTER TABLE realplayerstats 
      DROP CONSTRAINT IF EXISTS realplayerstats_pkey
    `;
    
    // 2. Make tournament_id nullable
    console.log('   - Making tournament_id nullable...');
    await sql`
      ALTER TABLE realplayerstats 
      ALTER COLUMN tournament_id DROP NOT NULL
    `;
    
    // 3. Create new primary key on (player_id, season_id)
    console.log('   - Setting up new primary key (player_id, season_id)...');
    await sql`
      ALTER TABLE realplayerstats 
      ADD CONSTRAINT realplayerstats_pkey PRIMARY KEY (player_id, season_id)
    `;
    
    // 4. Re-add the foreign key constraint (allows nulls now)
    console.log('   - Re-adding foreign key referencing tournaments table...');
    await sql`
      ALTER TABLE realplayerstats 
      ADD CONSTRAINT fk_realplayerstats_tournament 
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    `;
    
    console.log('✅ Migration successful! tournament_id is now nullable.');
    
    // Verify schema properties
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'realplayerstats'
        AND column_name = 'tournament_id'
    `;
    console.log('\n📊 Column details:');
    columns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} | Nullable: ${col.is_nullable}`);
    });
    
  } catch (error) {
    console.error('❌ Error executing migration:', error);
    throw error;
  }
}

makeTournamentNullable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
