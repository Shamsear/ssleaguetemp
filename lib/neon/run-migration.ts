/**
 * Run this script to create tables in Neon and migrate data from Firebase.
 * 
 * Usage: NEON_MAIN_DB_URL=your_url npx tsx lib/neon/run-migration.ts
 */

import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const NEON_URL = process.env.NEON_MAIN_DB_URL;

async function runMigration() {
  if (!NEON_URL) {
    console.error('❌ NEON_MAIN_DB_URL not set. Add it to .env.local');
    process.exit(1);
  }

  console.log('🔌 Connecting to Neon...');
  const pool = new Pool({ connectionString: NEON_URL });

  try {
    // Test connection
    const testResult = await pool.query('SELECT NOW() as time');
    console.log('✅ Connected:', testResult.rows[0].time);

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'main-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    console.log('📋 Creating tables...');
    
    // Use pool.query for raw SQL (neon tagged template doesn't support raw SQL)
    try {
      await pool.query(schema);
      console.log('  ✅ Schema executed successfully');
    } catch (error: any) {
      // Some statements may already exist - that's OK
      if (error.message?.includes('already exists')) {
        console.log('  ⏭️ Some objects already exist, continuing...');
      } else {
        console.error('  ❌ Schema error:', error.message);
        // Try statement by statement
        const statements = schema
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
          try {
            await pool.query(stmt + ';');
            const preview = stmt.split('\n')[0].substring(0, 80);
            console.log(`  ✅ ${preview}`);
          } catch (err: any) {
            if (err.message?.includes('already exists')) {
              console.log(`  ⏭️ Already exists`);
            } else {
              console.error(`  ❌ ${err.message.substring(0, 100)}`);
            }
          }
        }
      }
    }

    // Verify tables exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\n📊 Tables in database:');
    for (const t of tables.rows) {
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${t.table_name}`);
      console.log(`  - ${t.table_name} (${countResult.rows[0].count} rows)`);
    }

    console.log('\n✅ Schema migration complete!');
    console.log('Next step: Run the data migration via POST /api/migrate/firebase-to-neon');

  } finally {
    await pool.end();
  }
}

runMigration().catch(console.error);
