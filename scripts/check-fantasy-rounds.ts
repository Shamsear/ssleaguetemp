// Load environment variables from .env.local FIRST
import { config } from 'dotenv';
config({ path: '.env.local' });

// Now import fantasySql
import { fantasySql } from '../lib/neon/fantasy-config';

async function checkRounds() {
  console.log('🔍 Checking fantasy rounds...\n');
  
  try {
    // Check all leagues
    const leagues = await fantasySql`
      SELECT league_id, season_name 
      FROM fantasy_leagues 
      ORDER BY created_at DESC
    `;
    
    console.log(`📋 Found ${leagues.length} league(s)\n`);
    
    for (const league of leagues) {
      console.log(`\n📌 ${league.season_name} (${league.league_id})`);
      
      // Check rounds for this league
      const rounds = await fantasySql`
        SELECT 
          round_id,
          round_number,
          round_name,
          is_active,
          is_completed,
          points_calculated
        FROM fantasy_rounds
        WHERE league_id = ${league.league_id}
        ORDER BY round_number ASC
      `;
      
      if (rounds.length === 0) {
        console.log('   ⚠️ No rounds found for this league');
      } else {
        console.log(`   ✅ Found ${rounds.length} round(s):`);
        rounds.forEach((r: any) => {
          console.log(`      - Round ${r.round_number}: ${r.round_name || r.round_id}`);
          console.log(`        Active: ${r.is_active ? '✓' : '✗'} | Completed: ${r.is_completed ? '✓' : '✗'} | Points Calc: ${r.points_calculated ? '✓' : '✗'}`);
        });
      }
    }
    
    // Check total rounds across all leagues
    const totalRounds = await fantasySql`
      SELECT COUNT(*) as count FROM fantasy_rounds
    `;
    
    console.log(`\n\n📊 Total rounds in database: ${totalRounds[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

checkRounds()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
