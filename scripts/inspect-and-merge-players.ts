import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { adminDb } from '../lib/firebase/admin'; // Let's see if this works, or we can use adminDb via firebase-admin directly

dotenv.config();

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!dbUrl) {
  console.error('❌ Database URL not found in environment variables.');
  process.exit(1);
}

const sql = neon(dbUrl);

async function main() {
  const p199 = 'sspslpsl0199';
  const p85 = 'sspslpsl0085';

  console.log(`🔍 Inspecting databases for player IDs: ${p199} (duplicate) and ${p85} (target)...`);

  // 1. Find all tables and columns referencing player IDs in Postgres
  const columns = await sql`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (column_name LIKE '%player_id%' OR column_name = 'id' OR column_name = 'player_name')
    ORDER BY table_name
  `;

  console.log(`\n📋 Found matching columns in Postgres information_schema:`);
  for (const col of columns) {
    console.log(`  - ${col.table_name}.${col.column_name}`);
  }

  // 2. Scan tables for records matching p199 and p85
  console.log('\n📊 Scanning Postgres tables for references to both player IDs...');
  
  // We want to dynamically check each table to see if it has rows matching the IDs
  const checkedTables = new Set<string>();
  for (const col of columns) {
    const tableName = col.table_name;
    const colName = col.column_name;
    
    // Skip checking duplicate columns per table
    const checkKey = `${tableName}:${colName}`;
    
    try {
      // Find count of rows matching either player id
      let queryStr = '';
      if (colName === 'id') {
        // Typically for primary key columns like "footballplayers" or "realplayers"
        const count199 = await sql(`SELECT COUNT(*) FROM "${tableName}" WHERE id = $1`, [p199]);
        const count85 = await sql(`SELECT COUNT(*) FROM "${tableName}" WHERE id = $1`, [p85]);
        if (Number(count199[0].count) > 0 || Number(count85[0].count) > 0) {
          console.log(`  ✨ Table "${tableName}" column "${colName}":`);
          console.log(`    - ${p199}: ${count199[0].count} rows`);
          console.log(`    - ${p85}: ${count85[0].count} rows`);
        }
      } else {
        const count199 = await sql(`SELECT COUNT(*) FROM "${tableName}" WHERE "${colName}" = $1`, [p199]);
        const count85 = await sql(`SELECT COUNT(*) FROM "${tableName}" WHERE "${colName}" = $1`, [p85]);
        if (Number(count199[0].count) > 0 || Number(count85[0].count) > 0) {
          console.log(`  ✨ Table "${tableName}" column "${colName}":`);
          console.log(`    - ${p199}: ${count199[0].count} rows`);
          console.log(`    - ${p85}: ${count85[0].count} rows`);
        }
      }
    } catch (err: any) {
      // Some columns might not contain strings, ignore
    }
  }

  // 3. Scan Firestore collections
  console.log('\n🔥 Scanning Firestore for references...');
  try {
    const collections = ['players', 'realplayers', 'player_stats', 'player_seasons', 'bids', 'transfer_requests'];
    for (const colName of collections) {
      const snap = await adminDb.collection(colName).doc(p199).get();
      const snap85 = await adminDb.collection(colName).doc(p85).get();
      if (snap.exists || snap85.exists) {
        console.log(`  ✨ Firestore collection "${colName}":`);
        console.log(`    - Document ${p199}: ${snap.exists ? 'EXISTS' : 'does not exist'}`);
        console.log(`    - Document ${p85}: ${snap85.exists ? 'EXISTS' : 'does not exist'}`);
      }
    }
  } catch (err: any) {
    console.error('  Error scanning Firestore:', err.message);
  }
}

main().catch(console.error);
