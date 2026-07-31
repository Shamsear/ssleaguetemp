const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function countTeams() {
  console.log('🔍 Counting teams in the database by season...');

  try {
    // 1. Count teams grouped by season_id
    const seasonCounts = await sql`
      SELECT season_id, COUNT(*) as team_count
      FROM teams
      GROUP BY season_id
      ORDER BY season_id DESC
    `;
    console.log('\n📊 Total Team Counts Grouped by Season:');
    console.table(seasonCounts);

    // 2. Select all teams in Season 17 (SSPSLS17)
    const s17Teams = await sql`
      SELECT id, name, season_id, football_budget, football_total_slots
      FROM teams
      WHERE season_id = 'SSPSLS17'
      ORDER BY name ASC
    `;
    console.log(`\n👥 Teams registered for Season 17 (${s17Teams.length} found):`);
    console.table(s17Teams);

    // 3. Select all teams in Season 18 (SSPSLS18)
    const s18Teams = await sql`
      SELECT id, name, season_id, football_budget, football_total_slots
      FROM teams
      WHERE season_id = 'SSPSLS18'
      ORDER BY name ASC
    `;
    console.log(`\n👥 Teams registered for Season 18 (${s18Teams.length} found):`);
    console.table(s18Teams);

  } catch (error) {
    console.error('❌ Error checking database:', error);
  }
}

countTeams();
