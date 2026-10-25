import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
});

import { neon } from '@neondatabase/serverless';

async function run() {
  const sql = neon(process.env.NEON_MAIN_DB_URL!);
  const tables = await sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name
  `;
  console.log('Tables in NEON_MAIN_DB_URL:', tables.map((t: any) => t.table_name));

  if (tables.some((t: any) => t.table_name === 'seasons')) {
    const seasons = await sql`SELECT * FROM seasons ORDER BY id`;
    console.log('Seasons in NEON_MAIN_DB_URL:');
    console.table(seasons);
  }
}

run().catch(console.error);
