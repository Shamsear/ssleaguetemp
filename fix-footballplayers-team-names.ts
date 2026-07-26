import { getAuctionDb } from './lib/neon/auction-config';

/**
 * This script fixes the team_name field in footballplayers table:
 * 1. Sets team_name to NULL for players who are not sold (free agents)
 * 2. Sets team_name to NULL for players who have club names instead of team names
 * 3. Updates team_name for sold players to match their current team_id
 */
async function fixFootballPlayersTeamNames() {
  const sql = getAuctionDb();
  
  console.log('🔧 Fixing footballplayers team_name field...\n');
  
  try {
    // Step 1: Set team_name to NULL for unsold players (free agents)
    console.log('Step 1: Cleaning team_name for unsold players...');
    const freeAgentResult = await sql`
      UPDATE footballplayers
      SET team_name = NULL, updated_at = NOW()
      WHERE is_sold = false
      AND team_name IS NOT NULL
    `;
    console.log(`✅ Cleared team_name for ${freeAgentResult.length} free agent players\n`);

    // Step 2: Set team_name to NULL for players with club names
    // Common club names that should be cleared
    const clubNames = [
      'Manchester United', 'Manchester City', 'Liverpool', 'Chelsea', 'Arsenal',
      'Tottenham', 'Real Madrid', 'Barcelona', 'Bayern Munich', 'PSG',
      'Juventus', 'Inter Milan', 'AC Milan', 'Atletico Madrid', 'Borussia Dortmund',
      'Ajax', 'Porto', 'Benfica', 'Sporting', 'Napoli', 'AS Roma', 'Lazio',
      'Sevilla', 'Valencia', 'Leicester City', 'West Ham', 'Everton',
      'Newcastle', 'Aston Villa', 'Brighton', 'Wolves', 'Crystal Palace',
      'Al Nassr', 'Al Hilal', 'Al Ittihad', 'Inter Miami', 'LA Galaxy'
    ];

    console.log('Step 2: Cleaning club names from team_name field...');
    const clubNameResult = await sql`
      UPDATE footballplayers
      SET team_name = NULL, updated_at = NOW()
      WHERE team_name = ANY(${clubNames})
    `;
    console.log(`✅ Cleared ${clubNameResult.length} players with club names\n`);

    // Step 3: Get all valid teams from the teams table
    console.log('Step 3: Loading valid team names...');
    const teams = await sql`
      SELECT DISTINCT id, name
      FROM teams
      WHERE name IS NOT NULL
      ORDER BY id
    `;
    
    const teamMap = new Map<string, string>();
    teams.forEach((team: any) => {
      teamMap.set(team.id, team.name);
    });
    
    console.log(`📋 Found ${teams.length} valid teams\n`);

    // Step 4: Update team_name for sold players based on their team_id
    console.log('Step 4: Updating team_name for sold players...');
    
    const soldPlayers = await sql`
      SELECT id, team_id, team_name
      FROM footballplayers
      WHERE is_sold = true
      AND team_id IS NOT NULL
      ORDER BY team_id
    `;

    console.log(`📊 Processing ${soldPlayers.length} sold players...\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let nullifiedCount = 0;

    for (const player of soldPlayers) {
      const correctTeamName = teamMap.get(player.team_id);

      if (!correctTeamName) {
        // Team not found in teams table - set to NULL
        await sql`
          UPDATE footballplayers
          SET team_name = NULL, updated_at = NOW()
          WHERE id = ${player.id}
        `;
        console.log(`⚠️  ${player.id}: team_id "${player.team_id}" not found, set team_name to NULL`);
        nullifiedCount++;
      } else if (player.team_name !== correctTeamName) {
        // Update to correct team name
        await sql`
          UPDATE footballplayers
          SET team_name = ${correctTeamName}, updated_at = NOW()
          WHERE id = ${player.id}
        `;
        console.log(`✅ ${player.id}: "${player.team_name}" → "${correctTeamName}"`);
        updatedCount++;
      } else {
        // Already correct
        skippedCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updatedCount} players`);
    console.log(`   ⏭️  Skipped: ${skippedCount} players (already correct)`);
    console.log(`   ⚠️  Nullified: ${nullifiedCount} players (team not found)`);
    console.log(`   🧹 Free agents cleared: ${freeAgentResult.length} players`);
    console.log(`   🏟️  Club names cleared: ${clubNameResult.length} players`);
    
    // Step 5: Verification
    console.log('\n🔍 Verification:');
    
    const soldWithNoTeamName = await sql`
      SELECT COUNT(*) as count
      FROM footballplayers
      WHERE is_sold = true
      AND team_id IS NOT NULL
      AND team_name IS NULL
    `;
    
    const unsoldWithTeamName = await sql`
      SELECT COUNT(*) as count
      FROM footballplayers
      WHERE is_sold = false
      AND team_name IS NOT NULL
    `;

    console.log(`   Sold players with NULL team_name: ${soldWithNoTeamName[0]?.count || 0}`);
    console.log(`   Free agents with team_name set: ${unsoldWithTeamName[0]?.count || 0}`);

    if (soldWithNoTeamName[0]?.count > 0) {
      console.log('\n⚠️  Warning: Some sold players still have NULL team_name. Check if their team_id exists in teams table.');
    }

    console.log('\n✨ Done!');
    
  } catch (error) {
    console.error('❌ Error fixing team names:', error);
    throw error;
  }
}

fixFootballPlayersTeamNames()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
