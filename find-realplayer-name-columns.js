/**
 * Find all tables with real player name columns in Neon Tournament DB
 */

require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');
const sql=neon(process.env.NEON_TOURNAMENT_DB_URL);

(async () => {
  console.log('Searching for tables with player name columns...\n');
  
  // Get all tables
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  
  console.log(`Found ${tables.length} tables\n`);
  
  const tablesWithPlayerNames = [];
  
  for (const table of tables) {
    const tableName = table.table_name;
    
    // Get columns for this table
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = ${tableName}
      AND (
        column_name ILIKE '%player%name%' OR
        column_name = 'name' OR
        column_name = 'display_name'
      )
      ORDER BY ordinal_position
    `;
    
    if (columns.length > 0) {
      // Check if it's likely a real player table (not football player)
      // by checking for typical real player columns
      const allColumns = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = ${tableName}
      `;
      
      const columnNames = allColumns.map(c => c.column_name.toLowerCase());
      const hasRealPlayerIndicators = 
        columnNames.includes('player_id') && 
        (tableName.includes('real') || 
         columnNames.includes('goals_scored') || 
         columnNames.includes('matches_played'));
      
      const isNotFootballPlayer = 
        !tableName.includes('football') && 
        !tableName.includes('efootball');
      
      if (hasRealPlayerIndicators && isNotFootballPlayer) {
        // Sample some data to see if there are non-uppercase names
        let sampleData = [];
        try {
          const nameColumn = columns[0].column_name;
          const query = `SELECT ${nameColumn}, COUNT(*) as count FROM ${tableName} WHERE ${nameColumn} != UPPER(${nameColumn}) GROUP BY ${nameColumn} LIMIT 5`;
          sampleData = await sql.unsafe(query);
        } catch (e) {
          // Skip if error
        }
        
        tablesWithPlayerNames.push({
          table: tableName,
          columns: columns,
          sampleData: sampleData
        });
      }
    }
  }
  
  if (tablesWithPlayerNames.length === 0) {
    console.log('No tables with real player names found.');
    return;
  }
  
  console.log('=' .repeat(80));
  console.log('TABLES WITH REAL PLAYER NAME COLUMNS');
  console.log('=' .repeat(80));
  console.log();
  
  for (const item of tablesWithPlayerNames) {
    console.log(`📊 Table: ${item.table}`);
    console.log(`   Columns:`);
    item.columns.forEach(col => {
      console.log(`     - ${col.column_name} (${col.data_type})`);
    });
    
    if (item.sampleData.length > 0) {
      console.log(`   Sample non-uppercase names:`);
      item.sampleData.forEach(row => {
        const nameCol = item.columns[0].column_name;
        console.log(`     - "${row[nameCol]}" (${row.count} records)`);
      });
    }
    console.log();
  }
  
  console.log('Summary:');
  console.log(`  Total tables with player names: ${tablesWithPlayerNames.length}`);
})();
