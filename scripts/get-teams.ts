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
  const teams = await sql`SELECT * FROM teams LIMIT 10`;
  console.log('TEAMS IN NEON DATABASE:');
  console.dir(teams, { depth: null });
}

main().catch(console.error);
