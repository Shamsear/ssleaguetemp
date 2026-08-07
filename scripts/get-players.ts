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
  const players = await sql`
    SELECT id, player_id, name, team_id, acquisition_value 
    FROM footballplayers 
    WHERE team_id IS NOT NULL 
    LIMIT 10
  `;
  console.log('PLAYERS IN NEON DATABASE:');
  console.dir(players, { depth: null });
}

main().catch(console.error);
