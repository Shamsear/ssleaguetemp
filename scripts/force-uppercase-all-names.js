/**
 * FORCE UPDATE all name columns to UPPERCASE in Tournament DB
 * No checking - just update everything
 */

const readline = require('readline');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise(resolve => rl.question(query, resolve));
};

(async () => {
  console.log('\n' + '='.repeat(80));
  console.log('🔠 FORCE UPDATE player_name AND name COLUMNS TO UPPERCASE');
  console.log('='.repeat(80));
  console.log('\nThis will update ALL "player_name" and "name" columns to UPPERCASE.\n');
  
  try {
    // Get ALL tables
    const allTables = await sql`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    console.log(`Found ${allTables.length} total tables\n`);
    
    const columnsToUpdate = [];
    
    for (const {table_name} of allTables) {
      // Get only 'name' or 'player_name' columns
      const nameColumns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = ${table_name}
        AND (column_name = 'name' OR column_name = 'player_name')
        AND data_type IN ('text', 'character varying')
        ORDER BY column_name
      `;
      
      for (const {column_name} of nameColumns) {
        columnsToUpdate.push({
          table: table_name,
          column: column_name
        });
      }
    }
    
    console.log(`Found ${columnsToUpdate.length} name columns to update:\n`);
    
    // Show all columns
    const grouped = {};
    columnsToUpdate.forEach(c => {
      if (!grouped[c.table]) grouped[c.table] = [];
      grouped[c.table].push(c.column);
    });
    
    Object.entries(grouped).forEach(([table, cols]) => {
      console.log(`  ${table}: ${cols.join(', ')}`);
    });
    
    const confirm = await question('\n❓ Proceed with updates? (type "yes" to confirm): ');
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled');
      rl.close();
      return;
    }
    
    console.log('\n🔄 Updating all columns...\n');
    
    let updated = 0;
    let errors = 0;
    
    for (const {table, column} of columnsToUpdate) {
      try {
        await sql.unsafe(`
          UPDATE ${table}
          SET ${column} = UPPER(${column})
          WHERE ${column} IS NOT NULL AND ${column} != ''
        `);
        console.log(`  ✅ ${table}.${column}`);
        updated++;
      } catch (e) {
        console.log(`  ⚠️  ${table}.${column} - ${e.message.substring(0, 50)}`);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Update complete!\n');
    console.log(`Updated: ${updated} columns`);
    console.log(`Errors: ${errors} columns`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
  
  rl.close();
})();
