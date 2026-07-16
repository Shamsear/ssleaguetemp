import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

async function checkTournaments() {
  try {
    const tournaments = await sql`
      SELECT id, tournament_name, status, season_id
      FROM tournaments
      ORDER BY tournament_name
    `;

    console.log('\n📋 All Tournaments in Database:');
    tournaments.forEach(t => {
      console.log(`  - ID: ${t.id} | Name: ${t.tournament_name} | Season: ${t.season_id} | Status: ${t.status}`);
    });
    console.log(`Total: ${tournaments.length} tournaments\n`);
  } catch (error) {
    console.error('Error listing tournaments:', error);
  }
}

checkTournaments()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
