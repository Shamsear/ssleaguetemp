/**
 * Convert Real Player Names to UPPERCASE in Additional Tables
 * 
 * This script updates player names to full uppercase in:
 * 1. awards table (name or player_name column)
 * 2. managers table (name column)
 * 3. owners table (name column)
 * 4. player_awards table (player_name column)
 * 
 * Usage: node scripts/uppercase-additional-realplayer-tables.js
 */

const readline = require('readline');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize Neon
const tournamentSql = process.env.NEON_TOURNAMENT_DB_URL ? neon(process.env.NEON_TOURNAMENT_DB_URL) : null;
if (!tournamentSql) {
  console.error('❌ Error: NEON_TOURNAMENT_DB_URL not found!');
  process.exit(1);
}
console.log('✅ Neon Tournament DB initialized');

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise(resolve => rl.question(query, resolve));
};

async function uppercaseAdditionalTables() {
  console.log('\n' + '='.repeat(80));
  console.log('🔠 CONVERT PLAYER NAMES TO UPPERCASE IN ADDITIONAL TABLES');
  console.log('='.repeat(80));
  console.log('\nThis script will convert player names in awards, managers, owners, player_awards.\n');
  
  try {
    const tablesToUpdate = [];
    
    // Step 1: Check awards table
    console.log('1️⃣ Checking awards table...\n');
    
    const awardsExists = await tournamentSql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'awards'
      ) as exists
    `;
    
    if (awardsExists[0].exists) {
      // Check which column exists: name or player_name
      const awardsColumns = await tournamentSql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'awards' 
        AND (column_name = 'name' OR column_name = 'player_name')
      `;
      
      if (awardsColumns.length > 0) {
        const columnName = awardsColumns[0].column_name;
        try {
          const count = await tournamentSql.unsafe(`
            SELECT COUNT(*) as count 
            FROM awards 
            WHERE ${columnName} IS NOT NULL 
            AND ${columnName} != UPPER(${columnName})
          `);
          
          if (count && count[0] && count[0].count > 0) {
            tablesToUpdate.push({
              table: 'awards',
              column: columnName,
              count: count[0].count
            });
            console.log(`   Awards table: ${count[0].count} records need updates (column: ${columnName})`);
          } else {
            console.log(`   Awards table: Already all uppercase (column: ${columnName})`);
          }
        } catch (e) {
          console.log(`   Awards table: Error checking - ${e.message}`);
        }
      }
    } else {
      console.log('   Awards table: Does not exist');
    }
    
    // Step 2: Check managers table
    console.log('\n2️⃣ Checking managers table...\n');
    
    const managersExists = await tournamentSql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'managers'
      ) as exists
    `;
    
    if (managersExists[0].exists) {
      const managersHasName = await tournamentSql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'managers' 
          AND column_name = 'name'
        ) as exists
      `;
      
      if (managersHasName[0].exists) {
        const count = await tournamentSql`
          SELECT COUNT(*) as count 
          FROM managers 
          WHERE name IS NOT NULL 
          AND name != UPPER(name)
        `;
        
        if (count[0].count > 0) {
          tablesToUpdate.push({
            table: 'managers',
            column: 'name',
            count: count[0].count
          });
          console.log(`   Managers table: ${count[0].count} records need updates`);
        } else {
          console.log(`   Managers table: Already all uppercase`);
        }
      }
    } else {
      console.log('   Managers table: Does not exist');
    }
    
    // Step 3: Check owners table
    console.log('\n3️⃣ Checking owners table...\n');
    
    const ownersExists = await tournamentSql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'owners'
      ) as exists
    `;
    
    if (ownersExists[0].exists) {
      const ownersHasName = await tournamentSql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'owners' 
          AND column_name = 'name'
        ) as exists
      `;
      
      if (ownersHasName[0].exists) {
        const count = await tournamentSql`
          SELECT COUNT(*) as count 
          FROM owners 
          WHERE name IS NOT NULL 
          AND name != UPPER(name)
        `;
        
        if (count[0].count > 0) {
          tablesToUpdate.push({
            table: 'owners',
            column: 'name',
            count: count[0].count
          });
          console.log(`   Owners table: ${count[0].count} records need updates`);
        } else {
          console.log(`   Owners table: Already all uppercase`);
        }
      }
    } else {
      console.log('   Owners table: Does not exist');
    }
    
    // Step 4: Check player_awards table
    console.log('\n4️⃣ Checking player_awards table...\n');
    
    const playerAwardsExists = await tournamentSql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'player_awards'
      ) as exists
    `;
    
    if (playerAwardsExists[0].exists) {
      const playerAwardsHasPlayerName = await tournamentSql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'player_awards' 
          AND column_name = 'player_name'
        ) as exists
      `;
      
      if (playerAwardsHasPlayerName[0].exists) {
        const count = await tournamentSql`
          SELECT COUNT(*) as count 
          FROM player_awards 
          WHERE player_name IS NOT NULL 
          AND player_name != UPPER(player_name)
        `;
        
        if (count[0].count > 0) {
          tablesToUpdate.push({
            table: 'player_awards',
            column: 'player_name',
            count: count[0].count
          });
          console.log(`   Player_awards table: ${count[0].count} records need updates`);
        } else {
          console.log(`   Player_awards table: Already all uppercase`);
        }
      }
    } else {
      console.log('   Player_awards table: Does not exist');
    }
    
    // Step 5: Show summary and confirm
    if (tablesToUpdate.length === 0) {
      console.log('\n✅ All tables are already in UPPERCASE or do not exist!');
      rl.close();
      return;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 UPDATE SUMMARY');
    console.log('='.repeat(80));
    console.log();
    
    tablesToUpdate.forEach(t => {
      console.log(`${t.table} (${t.column}): ${t.count} records`);
    });
    
    const totalUpdates = tablesToUpdate.reduce((sum, t) => sum + t.count, 0);
    console.log(`\nTotal updates: ${totalUpdates} records across ${tablesToUpdate.length} tables`);
    
    // Show sample data
    console.log('\nSample data (first 5 from each table):');
    for (const table of tablesToUpdate) {
      try {
        const samples = await tournamentSql.unsafe(`
          SELECT ${table.column} 
          FROM ${table.table} 
          WHERE ${table.column} IS NOT NULL 
          AND ${table.column} != UPPER(${table.column})
          LIMIT 5
        `);
        
        console.log(`\n  ${table.table}:`);
        if (Array.isArray(samples) && samples.length > 0) {
          samples.forEach(row => {
            const value = row[table.column];
            if (value) {
              console.log(`    "${value}" → "${value.toUpperCase()}"`);
            }
          });
        } else {
          console.log(`    (No sample data available)`);
        }
      } catch (e) {
        console.log(`    (Error fetching samples: ${e.message})`);
      }
    }
    
    const confirm = await question('\n❓ Proceed with updates? (type "yes" to confirm): ');
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled');
      rl.close();
      return;
    }
    
    console.log('\n🔄 Starting update process...\n');
    
    // Step 6: Update each table
    let stepNum = 5;
    for (const table of tablesToUpdate) {
      console.log(`${stepNum}️⃣ Updating ${table.table} table...`);
      
      try {
        await tournamentSql.unsafe(`
          UPDATE ${table.table}
          SET 
            ${table.column} = UPPER(${table.column}),
            updated_at = NOW()
          WHERE ${table.column} IS NOT NULL 
          AND ${table.column} != UPPER(${table.column})
        `);
        
        console.log(`   ✅ Updated ${table.count} records in ${table.table}\n`);
      } catch (error) {
        // Try without updated_at if it doesn't exist
        try {
          await tournamentSql.unsafe(`
            UPDATE ${table.table}
            SET ${table.column} = UPPER(${table.column})
            WHERE ${table.column} IS NOT NULL 
            AND ${table.column} != UPPER(${table.column})
          `);
          
          console.log(`   ✅ Updated ${table.count} records in ${table.table} (no timestamp)\n`);
        } catch (e) {
          console.log(`   ⚠️  Error updating ${table.table}: ${e.message}\n`);
        }
      }
      
      stepNum++;
    }
    
    console.log('✅ All updates complete!\n');
    console.log('📝 Summary:');
    tablesToUpdate.forEach(t => {
      console.log(`   - ${t.table}: ${t.count} records updated`);
    });
    console.log('\n📝 Next steps:');
    console.log('   1. Verify player names in admin panel');
    console.log('   2. Check awards and player_awards pages');
    console.log('   3. Verify managers and owners data if applicable\n');
    
  } catch (error) {
    console.error('❌ Error during update:', error);
    console.error(error.stack);
  }
  
  rl.close();
}

// Run the script
uppercaseAdditionalTables().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
