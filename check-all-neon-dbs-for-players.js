/**
 * Check ALL Neon databases for tables with player names
 */

require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');

const databases = {
  'Main DB': process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
  'Tournament DB': process.env.NEON_TOURNAMENT_DB_URL,
  'Auction DB': process.env.NEON_AUCTION_DB_URL,
  'Fantasy DB': process.env.FANTASY_DATABASE_URL
};

(async () => {
  console.log('Checking ALL Neon databases for player name columns...\n');
  console.log('='.repeat(80));
  
  for (const [dbName, dbUrl] of Object.entries(databases)) {
    if (!dbUrl) {
      console.log(`\n${dbName}: Not configured`);
      continue;
    }
    
    console.log(`\n📊 ${dbName}`);
    console.log('-'.repeat(80));
    
    const sql = neon(dbUrl);
    
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
        console.log('  No relevant tables found');
        continue;
      }
      
      // Group by table
      const tableGroups = {};
      tables.forEach(t => {
        if (!tableGroups[t.table_name]) {
          tableGroups[t.table_name] = [];
        }
        tableGroups[t.table_name].push(t.column_name);
      });
      
      for (const [tableName, columns] of Object.entries(tableGroups)) {
        console.log(`\n  Table: ${tableName}`);
        console.log(`  Columns: ${columns.join(', ')}`);
        
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
              console.log(`    ⚠️  ${column}: ${count[0].count} non-uppercase records`);
              
              // Get samples
              const samples = await sql.unsafe(`
                SELECT ${column}
                FROM ${tableName}
                WHERE ${column} IS NOT NULL
                AND ${column} != ''
                AND ${column} != UPPER(${column})
                LIMIT 3
              `);
              
              if (Array.isArray(samples)) {
                samples.forEach(s => {
                  const val = s[column];
                  if (val) console.log(`       - "${val}"`);
                });
              }
            } else {
              console.log(`    ✅ ${column}: All uppercase`);
            }
          } catch (e) {
            console.log(`    ❌ ${column}: Error - ${e.message}`);
          }
        }
      }
      
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('Scan complete!');
})();
