import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
const envVars: Record<string, string> = {};
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
      envVars[key] = val;
    }
  }
});

async function testDbs() {
  const dbs = {
    AUCTION: envVars.NEON_AUCTION_DB_URL,
    TOURNAMENT: envVars.NEON_TOURNAMENT_DB_URL,
    FANTASY: envVars.FANTASY_DATABASE_URL
  };

  for (const [name, url] of Object.entries(dbs)) {
    console.log(`\n=== Testing ${name} ===`);
    try {
      const sql = neon(url);
      const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
      console.log(`${name} tables (${tables.length}):`, tables.map((t: any) => t.table_name).join(', '));
    } catch (e: any) {
      console.error(`${name} error:`, e.message);
    }
  }
}

testDbs().catch(console.error);
