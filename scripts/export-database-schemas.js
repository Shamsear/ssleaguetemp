/**
 * Export Complete Database Schemas
 * Connects to all three databases and generates SQL dump files
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configurations
const databases = [
  {
    name: 'auction_database',
    url: process.env.NEON_AUCTION_DB_URL || process.env.DATABASE_URL,
    outputFile: 'auction_database_schema.sql'
  },
  {
    name: 'tournament_database',
    url: process.env.NEON_TOURNAMENT_DB_URL,
    outputFile: 'tournament_database_schema.sql'
  },
  {
    name: 'fantasy_database',
    url: process.env.FANTASY_DATABASE_URL,
    outputFile: 'fantasy_database_schema.sql'
  }
];

async function getTableSchema(pool, tableName) {
  const query = `
    SELECT 
      column_name,
      data_type,
      character_maximum_length,
      column_default,
      is_nullable,
      udt_name
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position;
  `;
  
  const result = await pool.query(query, [tableName]);
  return result.rows;
}

async function getTableConstraints(pool, tableName) {
  const query = `
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.update_rule,
      rc.delete_rule,
      pg_get_constraintdef(pgc.oid) as constraint_definition
    FROM information_schema.table_constraints AS tc
    LEFT JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    LEFT JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
    LEFT JOIN pg_constraint AS pgc
      ON pgc.conname = tc.constraint_name
    WHERE tc.table_name = $1
    ORDER BY tc.constraint_type, tc.constraint_name;
  `;
  
  const result = await pool.query(query, [tableName]);
  return result.rows;
}

async function getTableIndexes(pool, tableName) {
  const query = `
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = $1
    AND schemaname = 'public'
    ORDER BY indexname;
  `;
  
  const result = await pool.query(query, [tableName]);
  return result.rows;
}

async function getTableTriggers(pool, tableName) {
  const query = `
    SELECT
      trigger_name,
      event_manipulation,
      action_timing,
      action_statement
    FROM information_schema.triggers
    WHERE event_object_table = $1
    ORDER BY trigger_name;
  `;
  
  const result = await pool.query(query, [tableName]);
  return result.rows;
}

async function getFunctions(pool) {
  const query = `
    SELECT
      p.proname as function_name,
      pg_get_functiondef(p.oid) as function_definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    ORDER BY p.proname;
  `;
  
  const result = await pool.query(query);
  return result.rows;
}

async function getSequences(pool) {
  const query = `
    SELECT
      c.relname as sequence_name,
      pg_get_serial_sequence(t.schemaname || '.' || t.tablename, a.attname) as full_name,
      t.tablename,
      a.attname as column_name
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN (
      SELECT 
        schemaname,
        tablename,
        attname,
        pg_get_serial_sequence(schemaname || '.' || tablename, attname) as seq_name
      FROM pg_attribute
      JOIN pg_class ON pg_attribute.attrelid = pg_class.oid
      JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
      JOIN information_schema.tables ON tables.table_name = pg_class.relname
      WHERE pg_namespace.nspname = 'public'
      AND tables.table_schema = 'public'
      AND attnum > 0
      AND NOT attisdropped
    ) t ON c.relname = substring(t.seq_name from '([^.]+)$')
    LEFT JOIN pg_attribute a ON t.attname = a.attname
    WHERE c.relkind = 'S'
    AND n.nspname = 'public'
    ORDER BY c.relname;
  `;
  
  const result = await pool.query(query);
  return result.rows;
}

function generateColumnDefinition(column) {
  let def = `  ${column.column_name} `;
  
  // Check if this is a SERIAL type (has nextval default)
  if (column.column_default && column.column_default.includes('nextval')) {
    if (column.data_type === 'integer') {
      def += 'SERIAL';
    } else if (column.data_type === 'bigint') {
      def += 'BIGSERIAL';
    } else {
      def += column.data_type.toUpperCase();
      if (column.column_default) {
        def += ` DEFAULT ${column.column_default}`;
      }
    }
  } else {
    // Data type
    if (column.data_type === 'character varying') {
      def += `VARCHAR(${column.character_maximum_length || 255})`;
    } else if (column.data_type === 'USER-DEFINED') {
      def += column.udt_name.toUpperCase();
    } else {
      def += column.data_type.toUpperCase();
    }
    
    // Default (only if not SERIAL)
    if (column.column_default) {
      def += ` DEFAULT ${column.column_default}`;
    }
  }
  
  // Nullable
  if (column.is_nullable === 'NO') {
    def += ' NOT NULL';
  }
  
  return def;
}

async function exportDatabaseSchema(dbConfig) {
  console.log(`\n📊 Exporting schema for: ${dbConfig.name}`);
  console.log(`📁 Output file: ${dbConfig.outputFile}`);
  
  const pool = new Pool({
    connectionString: dbConfig.url,
    ssl: { rejectUnauthorized: false }
  });

  try {
    let sqlOutput = [];
    
    sqlOutput.push(`-- ============================================`);
    sqlOutput.push(`-- Database Schema Export: ${dbConfig.name}`);
    sqlOutput.push(`-- Generated: ${new Date().toISOString()}`);
    sqlOutput.push(`-- ============================================\n`);
    
    sqlOutput.push(`-- IMPORTANT NOTES:`);
    sqlOutput.push(`-- 1. SERIAL and BIGSERIAL types automatically create sequences`);
    sqlOutput.push(`-- 2. Foreign key constraints are added AFTER all tables are created`);
    sqlOutput.push(`-- 3. Indexes use IF NOT EXISTS to prevent duplicate errors`);
    sqlOutput.push(`-- 4. This file can be safely re-run on an existing database\n`);
    
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    const tables = tablesResult.rows.map(r => r.table_name);
    console.log(`✓ Found ${tables.length} tables`);
    
    // Export functions first
    const functions = await getFunctions(pool);
    if (functions.length > 0) {
      sqlOutput.push(`-- ============================================`);
      sqlOutput.push(`-- FUNCTIONS`);
      sqlOutput.push(`-- ============================================\n`);
      
      for (const func of functions) {
        sqlOutput.push(`-- Function: ${func.function_name}`);
        sqlOutput.push(func.function_definition + ';\n');
      }
    }
    
    // Export each table
    const deferredConstraints = []; // Store foreign key constraints to add later
    
    for (const tableName of tables) {
      console.log(`  Processing: ${tableName}`);
      
      sqlOutput.push(`-- ============================================`);
      sqlOutput.push(`-- Table: ${tableName}`);
      sqlOutput.push(`-- ============================================\n`);
      
      // Get columns
      const columns = await getTableSchema(pool, tableName);
      
      // Start CREATE TABLE
      sqlOutput.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
      
      // Add columns
      const columnDefs = columns.map(col => generateColumnDefinition(col));
      
      // Get constraints
      const constraints = await getTableConstraints(pool, tableName);
      const constraintDefs = [];
      const seenConstraints = new Set();
      
      // Group constraints by name to handle composite keys
      const constraintGroups = {};
      for (const constraint of constraints) {
        const name = constraint.constraint_name;
        if (!constraintGroups[name]) {
          constraintGroups[name] = {
            type: constraint.constraint_type,
            columns: new Set(),
            foreign_table: constraint.foreign_table_name,
            foreign_column: constraint.foreign_column_name,
            delete_rule: constraint.delete_rule,
            definition: constraint.constraint_definition
          };
        }
        if (constraint.column_name) {
          constraintGroups[name].columns.add(constraint.column_name);
        }
      }
      
      // Process grouped constraints
      for (const [name, group] of Object.entries(constraintGroups)) {
        const columnArray = Array.from(group.columns);
        const constraintKey = `${group.type}:${columnArray.sort().join(',')}`;
        
        // Skip duplicates
        if (seenConstraints.has(constraintKey)) {
          continue;
        }
        seenConstraints.add(constraintKey);
        
        if (group.type === 'PRIMARY KEY') {
          constraintDefs.push(`  PRIMARY KEY (${columnArray.join(', ')})`);
        } else if (group.type === 'UNIQUE') {
          constraintDefs.push(`  UNIQUE (${columnArray.join(', ')})`);
        } else if (group.type === 'FOREIGN KEY') {
          // Defer foreign key constraints to avoid dependency issues
          const fkDef = `ALTER TABLE ${tableName} ADD FOREIGN KEY (${columnArray.join(', ')}) REFERENCES ${group.foreign_table}(${group.foreign_column})`;
          if (group.delete_rule && group.delete_rule !== 'NO ACTION') {
            deferredConstraints.push(fkDef + ` ON DELETE ${group.delete_rule};`);
          } else {
            deferredConstraints.push(fkDef + ';');
          }
        } else if (group.type === 'CHECK' && group.definition) {
          // Only add unique CHECK constraints
          if (!seenConstraints.has(`CHECK:${group.definition}`)) {
            constraintDefs.push(`  ${group.definition}`);
            seenConstraints.add(`CHECK:${group.definition}`);
          }
        }
      }
      
      // Combine columns and constraints
      const allDefs = [...columnDefs, ...constraintDefs];
      sqlOutput.push(allDefs.join(',\n'));
      sqlOutput.push(`);\n`);
      
      // Add indexes (with IF NOT EXISTS where possible)
      const indexes = await getTableIndexes(pool, tableName);
      for (const index of indexes) {
        if (!index.indexname.includes('_pkey')) { // Skip primary key indexes
          // Add IF NOT EXISTS for CREATE INDEX statements
          let indexDef = index.indexdef;
          if (indexDef.startsWith('CREATE INDEX ')) {
            indexDef = indexDef.replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ');
          } else if (indexDef.startsWith('CREATE UNIQUE INDEX ')) {
            indexDef = indexDef.replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ');
          }
          sqlOutput.push(indexDef + ';\n');
        }
      }
      
      // Add triggers
      const triggers = await getTableTriggers(pool, tableName);
      for (const trigger of triggers) {
        sqlOutput.push(`-- Trigger: ${trigger.trigger_name}`);
        sqlOutput.push(`DROP TRIGGER IF EXISTS ${trigger.trigger_name} ON ${tableName};`);
        sqlOutput.push(`CREATE TRIGGER ${trigger.trigger_name}`);
        sqlOutput.push(`  ${trigger.action_timing} ${trigger.event_manipulation}`);
        sqlOutput.push(`  ON ${tableName}`);
        sqlOutput.push(`  FOR EACH ROW`);
        sqlOutput.push(`  ${trigger.action_statement};\n`);
      }
      
      sqlOutput.push('');
    }
    
    // Add deferred foreign key constraints
    if (deferredConstraints.length > 0) {
      sqlOutput.push(`-- ============================================`);
      sqlOutput.push(`-- FOREIGN KEY CONSTRAINTS`);
      sqlOutput.push(`-- Added after all tables to avoid dependency issues`);
      sqlOutput.push(`-- ============================================\n`);
      
      for (const fkConstraint of deferredConstraints) {
        sqlOutput.push(fkConstraint + '\n');
      }
    }
    
    // Write to file
    const outputPath = path.join(process.cwd(), dbConfig.outputFile);
    fs.writeFileSync(outputPath, sqlOutput.join('\n'));
    
    console.log(`✅ Schema exported successfully to: ${dbConfig.outputFile}`);
    console.log(`   Total tables: ${tables.length}`);
    console.log(`   Total functions: ${functions.length}`);
    
  } catch (error) {
    console.error(`❌ Error exporting ${dbConfig.name}:`, error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('🚀 Starting database schema export...\n');
  
  for (const dbConfig of databases) {
    if (!dbConfig.url) {
      console.log(`⚠️  Skipping ${dbConfig.name} - No connection URL found`);
      continue;
    }
    
    try {
      await exportDatabaseSchema(dbConfig);
    } catch (error) {
      console.error(`Failed to export ${dbConfig.name}`);
    }
  }
  
  console.log('\n✨ Schema export complete!');
  console.log('\nGenerated files:');
  databases.forEach(db => {
    if (db.url && fs.existsSync(db.outputFile)) {
      const stats = fs.statSync(db.outputFile);
      console.log(`  - ${db.outputFile} (${(stats.size / 1024).toFixed(2)} KB)`);
    }
  });
}

main().catch(console.error);
