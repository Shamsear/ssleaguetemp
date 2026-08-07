import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: NEON_DATABASE_URL is not set in .env.local');
    process.exit(1);
  }
  const sql = neon(dbUrl);
  const teamstats = await sql`SELECT * FROM teamstats LIMIT 5`;
  console.log('TEAMSTATS IN NEON DATABASE:');
  console.dir(teamstats, { depth: null });
}

main().catch(console.error);
