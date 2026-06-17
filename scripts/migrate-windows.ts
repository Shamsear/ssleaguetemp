import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function migrate() {
  if (!process.env.NEON_DATABASE_URL) {
    console.error('NEON_DATABASE_URL is not set!');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  
  try {
    const schemaPath = path.join(process.cwd(), 'lib', 'neon', 'windows-schema.sql');
    const sqlContent = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Applying windows schema to Neon DB...');
    const statements = sqlContent.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
      
    for (const stmt of statements) {
      console.log(`Executing statement: ${stmt.substring(0, 50)}...`);
      await pool.query(stmt);
    }
    
    console.log('Windows schema migration complete!');
  } catch (error) {
    console.error('Error applying schema:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
