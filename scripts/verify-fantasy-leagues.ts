// Load environment variables from .env.local FIRST
import { config } from 'dotenv';
config({ path: '.env.local' });

// Now import fantasySql
import { fantasySql } from '../lib/neon/fantasy-config';

async function verifyLeagues() {
  console.log('📋 Fetching all fantasy leagues...\n');
  
  try {
    const leagues = await fantasySql`
      SELECT 
        league_id, 
        season_name, 
        draft_status, 
        draft_finalization_mode,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
      FROM fantasy_leagues 
      ORDER BY created_at DESC
    `;
    
    console.log(`✅ Found ${leagues.length} league(s)\n`);
    
    if (leagues.length === 0) {
      console.log('No leagues found in database.');
    } else {
      leagues.forEach((league: any) => {
        console.log(`📌 ${league.season_name}`);
        console.log(`   League ID: ${league.league_id}`);
        console.log(`   Status: ${league.draft_status}`);
        console.log(`   Finalization Mode: ${league.draft_finalization_mode || 'NULL'}`);
        console.log(`   Created: ${league.created_at}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

verifyLeagues()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
