import { sql } from '../lib/neon/config';

async function addRetiredColumn() {
  try {
    console.log('🔄 Adding retired column to footballplayers table...');
    
    // Add retired column with default value false
    await sql`
      ALTER TABLE footballplayers 
      ADD COLUMN IF NOT EXISTS retired BOOLEAN DEFAULT false
    `;
    
    console.log('✅ Successfully added retired column!');
    
    // Verify the column was added
    const result = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'footballplayers' 
      AND column_name = 'retired'
    `;
    
    console.log('✅ Column verified:', result);
    
  } catch (error) {
    console.error('❌ Error adding retired column:', error);
    throw error;
  }
}

// Run the migration
addRetiredColumn()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
