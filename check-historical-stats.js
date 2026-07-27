import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

async function checkHistoricalStats() {
  try {
    console.log('🔍 Checking historical player stats in database...\n');

    // Check if historical seasons exist
    const seasons = await sql`
      SELECT DISTINCT season_id, COUNT(*) as player_count
      FROM realplayerstats
      WHERE season_id IN ('SSPSLS6', 'SSPSLS7', 'SSPSLS8', 'SSPSLS9')
      GROUP BY season_id
      ORDER BY season_id
    `;

    console.log('📊 Historical Seasons Found:');
    console.log('─'.repeat(50));
    seasons.forEach(s => {
      console.log(`${s.season_id}: ${s.player_count} players`);
    });
    console.log('');

    // Get sample player data from each season
    for (const season of seasons) {
      console.log(`\n📋 Sample data from ${season.season_id}:`);
      console.log('─'.repeat(80));
      
      const players = await sql`
        SELECT 
          player_id,
          player_name,
          season_id,
          team,
          category,
          matches_played,
          matches_won,
          matches_drawn,
          matches_lost,
          goals_scored,
          goals_conceded,
          assists,
          clean_sheets,
          motm_awards,
          points as total_points,
          wins,
          draws,
          losses
        FROM realplayerstats
        WHERE season_id = ${season.season_id}
        ORDER BY points DESC NULLS LAST
        LIMIT 3
      `;

      players.forEach(p => {
        console.log(`\n  Player: ${p.player_name} (${p.player_id})`);
        console.log(`  Team: ${p.team}`);
        console.log(`  Category: ${p.category}`);
        console.log(`  Stats:`);
        console.log(`    Matches: ${p.matches_played || 0} (W:${p.matches_won || 0} D:${p.matches_drawn || 0} L:${p.matches_lost || 0})`);
        console.log(`    Goals: ${p.goals_scored || 0} scored, ${p.goals_conceded || 0} conceded`);
        console.log(`    Assists: ${p.assists || 0}`);
        console.log(`    Clean Sheets: ${p.clean_sheets || 0}`);
        console.log(`    MOTM Awards: ${p.motm_awards || 0}`);
        console.log(`    🎯 TOTAL POINTS: ${p.total_points || 0}`);
      });
    }

    // Check for players with missing total_points
    console.log('\n\n⚠️  Checking for missing total_points...');
    console.log('─'.repeat(80));
    
    for (const season of seasons) {
      const missing = await sql`
        SELECT COUNT(*) as count
        FROM realplayerstats
        WHERE season_id = ${season.season_id}
        AND (points IS NULL OR points = 0)
      `;
      
      const missingCount = parseInt(missing[0].count);
      if (missingCount > 0) {
        console.log(`❌ ${season.season_id}: ${missingCount} players with missing/zero total_points`);
        
        // Show sample of players with missing points
        const sampleMissing = await sql`
          SELECT player_name, team, matches_played, points
          FROM realplayerstats
          WHERE season_id = ${season.season_id}
          AND (points IS NULL OR points = 0)
          LIMIT 5
        `;
        
        sampleMissing.forEach(p => {
          console.log(`  - ${p.player_name} (${p.team}): matches=${p.matches_played || 0}, points=${p.points || 0}`);
        });
      } else {
        console.log(`✅ ${season.season_id}: All players have total_points`);
      }
    }

    // Summary statistics
    console.log('\n\n📈 Summary Statistics:');
    console.log('─'.repeat(80));
    
    for (const season of seasons) {
      const stats = await sql`
        SELECT 
          COUNT(*) as total_players,
          COUNT(CASE WHEN points > 0 THEN 1 END) as players_with_points,
          COUNT(CASE WHEN points IS NULL OR points = 0 THEN 1 END) as players_missing_points,
          SUM(points) as total_points_sum,
          AVG(points) as avg_points,
          MAX(points) as max_points,
          MIN(points) as min_points
        FROM realplayerstats
        WHERE season_id = ${season.season_id}
      `;
      
      const s = stats[0];
      console.log(`\n${season.season_id}:`);
      console.log(`  Total Players: ${s.total_players}`);
      console.log(`  Players with Points: ${s.players_with_points}`);
      console.log(`  Players Missing Points: ${s.players_missing_points}`);
      console.log(`  Total Points Sum: ${s.total_points_sum || 0}`);
      console.log(`  Average Points: ${s.avg_points ? parseFloat(s.avg_points).toFixed(2) : '0.00'}`);
      console.log(`  Max Points: ${s.max_points || 0}`);
      console.log(`  Min Points: ${s.min_points || 0}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkHistoricalStats();
