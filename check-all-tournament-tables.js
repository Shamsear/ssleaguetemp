/**
 * Check ALL tables in Tournament DB (no filters)
 */

require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

(async () => {
  console.log('Checking ALL tables in Tournament DB for name/player_name columns...\n');
  console.log('='.repeat(80));
  
  try {
    // Get ALL tables
    const allTables = await sql`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    console.log(`\nFound ${allTables.length} total tables\n`);
    
    let tablesWithNames = [];
    
    for (const {table_name} of allTables) {
      // Check if table has any name-like columns
      const nameColumns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = ${table_name}
        AND (
          column_name ILIKE '%name%' OR
          column_name = 'display_name'
        )
        ORDER BY column_name
      `;
      
      if (nameColumns.length > 0) {
        tablesWithNames.push({
          table: table_name,
          columns: nameColumns
        });
      }
    }
    
    console.log(`Found ${tablesWithNames.length} tables with name columns\n`);
    console.log('='.repeat(80));
    
    for (const {table, columns} of tablesWithNames) {
      console.log(`\n📊 Table: ${table}`);
      console.log(`   Columns: ${columns.map(c => c.column_name).join(', ')}`);
      
      // Check each column
      for (const {column_name} of columns) {
        try {
          const count = await sql.unsafe(`
            SELECT COUNT(*) as count
            FROM ${table}
            WHERE ${column_name} IS NOT NULL
            AND ${column_name} != ''
            AND ${column_name} != UPPER(${column_name})
          `);
          
          if (count[0] && count[0].count > 0) {
            console.log(`   ⚠️  ${column_name}: ${count[0].count} non-uppercase`);
            
            // Get samples
            const samples = await sql.unsafe(`
              SELECT ${column_name}
              FROM ${table}
              WHERE ${column_name} IS NOT NULL
              AND ${column_name} != ''
              AND ${column_name} != UPPER(${column_name})
              LIMIT 3
            `);
            
            if (Array.isArray(samples)) {
              samples.forEach(s => {
                const val = s[column_name];
                if (val) console.log(`      - "${val}"`);
              });
            }
          } else {
            console.log(`   ✅ ${column_name}: All uppercase or empty`);
          }
        } catch (e) {
          console.log(`   ⚠️  ${column_name}: Error - ${e.message.substring(0, 50)}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('Scan complete!');
    
  } catch (error) {
    console.log(`Error: ${error.message}`);
    console.error(error.stack);
  }
})();
