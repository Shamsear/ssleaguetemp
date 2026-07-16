import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

async function addSmartAssistColumn() {
  console.log('🔧 Adding used_smart_assist column to realplayerstats table...');
  
  try {
    // Add the used_smart_assist column
    await sql`
      ALTER TABLE realplayerstats 
      ADD COLUMN IF NOT EXISTS used_smart_assist VARCHAR(50)
    `;
    console.log('✅ Column used_smart_assist added');
    
    // Verify the column exists
    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'realplayerstats' 
        AND column_name = 'used_smart_assist'
    `;
    
    if (columns.length > 0) {
      console.log('\n✅ Verification successful!');
      console.log('📊 Column details:');
      columns.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
        console.log(`     Default: ${col.column_default}`);
        console.log(`     Nullable: ${col.is_nullable}`);
      });
    } else {
      console.log('\n⚠️  Warning: Column verification failed');
    }
    
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('❌ Error adding column:', error);
    throw error;
  }
}

addSmartAssistColumn()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
