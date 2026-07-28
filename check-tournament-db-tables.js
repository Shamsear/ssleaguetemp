/**
 * Check Tournament DB for ALL tables with player names
 */

require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

(async () => {
  console.log('Checking Tournament DB for player name columns...\n');
  console.log('='.repeat(80));
  
  try {
    // Get all tables with name or player_name columns
    const tables = await sql`
      SELECT DISTINCT table_name, column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND (
        column_name ILIKE '%player%name%' OR
        column_name = 'name' OR
        column_name = 'display_name'
      )
      AND table_name NOT LIKE '%football%'
      AND table_name NOT LIKE '%efootball%'
      ORDER BY table_name, column_name
    `;
    
    if (tables.length === 0) {
      console.log('No relevant tables found');
      return;
    }
    
    // Group by table
    const tableGroups = {};
    tables.forEach(t => {
      if (!tableGroups[t.table_name]) {
        tableGroups[t.table_name] = [];
      }
      tableGroups[t.table_name].push(t.column_name);
    });
    
    console.log(`\nFound ${Object.keys(tableGroups).length} tables with player name columns\n`);
    
    for (const [tableName, columns] of Object.entries(tableGroups)) {
      console.log(`📊 Table: ${tableName}`);
      console.log(`   Columns: ${columns.join(', ')}`);
      
      // Check for non-uppercase values in each column
      for (const column of columns) {
        try {
          const count = await sql.unsafe(`
            SELECT COUNT(*) as count
            FROM ${tableName}
            WHERE ${column} IS NOT NULL
            AND ${column} != ''
            AND ${column} != UPPER(${column})
          `);
          
          if (count[0] && count[0].count > 0) {
            console.log(`   ⚠️  ${column}: ${count[0].count} non-uppercase records`);
            
            // Get samples
            const samples = await sql.unsafe(`
              SELECT ${column}
              FROM ${tableName}
              WHERE ${column} IS NOT NULL
              AND ${column} != ''
              AND ${column} != UPPER(${column})
              LIMIT 5
            `);
            
            if (Array.isArray(samples)) {
              samples.forEach(s => {
                const val = s[column];
                if (val) console.log(`      - "${val}"`);
              });
            }
          } else {
            console.log(`   ✅ ${column}: All uppercase`);
          }
        } catch (e) {
          console.log(`   ❌ ${column}: Error - ${e.message}`);
        }
      }
      console.log();
    }
    
    console.log('='.repeat(80));
    console.log('Scan complete!');
    
  } catch (error) {
    console.log(`Error: ${error.message}`);
    console.error(error.stack);
  }
})();
