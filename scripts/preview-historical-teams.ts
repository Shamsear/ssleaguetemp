import { db } from '../lib/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import { query as pgQuery } from '../lib/neon';

async function previewHistoricalTeams() {
  console.log('🔍 Scanning Firebase for all historical teams...\n');
  
  try {
    // Get all team_seasons documents
    const teamSeasonsRef = collection(db, 'team_seasons');
    const snapshot = await getDocs(teamSeasonsRef);
    
    // Map to store: team_id -> { latestSeasonId, latestName, allNames }
    const teamHistory = new Map<string, { 
      seasonId: string;
      name: string;
      seasons: string[];
      allNames: Set<string>;
    }>();
    
    console.log(`📄 Processing ${snapshot.size} team_seasons documents...\n`);
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const teamId = data.team_id;
      const teamName = data.team_name;
      const seasonId = data.season_id;
      
      if (!teamId || !teamName || !seasonId) return;
      
      if (!teamHistory.has(teamId)) {
        teamHistory.set(teamId, {
          seasonId,
          name: teamName,
          seasons: [seasonId],
          allNames: new Set([teamName])
        });
      } else {
        const current = teamHistory.get(teamId)!;
        current.seasons.push(seasonId);
        current.allNames.add(teamName);
        
        // Update to latest season (compare season IDs numerically)
        const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
        if (getSeasonNum(seasonId) > getSeasonNum(current.seasonId)) {
          current.seasonId = seasonId;
          current.name = teamName;
        }
      }
    });
    
    console.log(`✅ Found ${teamHistory.size} unique teams in Firebase\n`);
    
    // Get existing teams from Neon
    const existingTeams = await pgQuery('SELECT team_uid, team_name, is_active FROM teams ORDER BY team_name');
    const existingMap = new Map(existingTeams.rows.map((t: any) => [t.team_uid, { name: t.team_name, active: t.is_active }]));
    
    console.log(`✅ Found ${existingTeams.rows.length} teams in Neon database\n`);
    console.log('═'.repeat(80));
    console.log('\n📊 CURRENT TEAMS IN NEON:\n');
    
    existingTeams.rows.forEach((team: any, i: number) => {
      console.log(`${i + 1}. ${team.team_name.padEnd(30)} (${team.team_uid}) ${team.is_active ? '🟢 Active' : '⚪ Inactive'}`);
    });
    
    console.log('\n' + '═'.repeat(80));
    console.log('\n🔍 TEAMS THAT WILL BE ADDED:\n');
    
    const teamsToAdd: any[] = [];
    const teamsWithMultipleNames: any[] = [];
    
    teamHistory.forEach((data, teamId) => {
      if (!existingMap.has(teamId)) {
        const teamInfo = {
          team_id: teamId,
          final_name: data.name,
          latest_season: data.seasonId,
          total_seasons: data.seasons.length,
          seasons: data.seasons.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
          }),
          had_multiple_names: data.allNames.size > 1,
          all_names: Array.from(data.allNames)
        };
        
        teamsToAdd.push(teamInfo);
        
        if (data.allNames.size > 1) {
          teamsWithMultipleNames.push(teamInfo);
        }
      }
    });
    
    if (teamsToAdd.length === 0) {
      console.log('✅ All historical teams are already in Neon! Nothing to add.\n');
    } else {
      teamsToAdd.forEach((team, i) => {
        console.log(`${i + 1}. ${team.final_name.padEnd(30)} (${team.team_id})`);
        console.log(`   Latest Season: ${team.latest_season}`);
        console.log(`   Total Seasons: ${team.total_seasons}`);
        console.log(`   Seasons: ${team.seasons.join(', ')}`);
        
        if (team.had_multiple_names) {
          console.log(`   ⚠️  HAD MULTIPLE NAMES: ${team.all_names.join(' → ')}`);
        }
        
        console.log('');
      });
    }
    
    console.log('═'.repeat(80));
    console.log('\n🎯 TEAMS WITH NAME CHANGES (These are the important ones!):\n');
    
    if (teamsWithMultipleNames.length === 0) {
      console.log('✅ No teams with name changes found in missing teams.\n');
    } else {
      teamsWithMultipleNames.forEach((team, i) => {
        console.log(`${i + 1}. ${team.all_names[0]} → ${team.final_name}`);
        console.log(`   ID: ${team.team_id}`);
        console.log(`   Name History: ${team.all_names.join(' → ')}`);
        console.log(`   This will fix ${team.total_seasons} seasons (${team.seasons.join(', ')})`);
        console.log('');
      });
    }
    
    console.log('═'.repeat(80));
    console.log('\n📈 SUMMARY:\n');
    console.log(`Total unique teams in Firebase: ${teamHistory.size}`);
    console.log(`Already in Neon: ${existingMap.size}`);
    console.log(`Will be added: ${teamsToAdd.length}`);
    console.log(`Teams with name changes: ${teamsWithMultipleNames.length}`);
    
    console.log('\n' + '═'.repeat(80));
    console.log('\n🔍 VERIFICATION - Example Team Resolver Test:\n');
    
    // Show example of how the resolver will work
    if (teamsWithMultipleNames.length > 0) {
      const example = teamsWithMultipleNames[0];
      console.log(`Example: Team "${example.all_names[0]}" (old name in ${example.seasons[0]})`);
      console.log(`├─ Will be added to Neon as: "${example.final_name}"`);
      console.log(`├─ All ${example.total_seasons} seasons will show: "${example.final_name}"`);
      console.log(`└─ This fixes the inconsistency across seasons!\n`);
    }
    
    console.log('═'.repeat(80));
    console.log('\n✅ READY TO PROCEED?\n');
    console.log('If everything looks good, run:');
    console.log('  curl -X POST http://localhost:3000/api/migrate/add-historical-teams\n');
    
    // Return data for potential JSON output
    return {
      summary: {
        totalInFirebase: teamHistory.size,
        alreadyInNeon: existingMap.size,
        willBeAdded: teamsToAdd.length,
        teamsWithNameChanges: teamsWithMultipleNames.length
      },
      teamsToAdd,
      teamsWithMultipleNames
    };
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the preview
previewHistoricalTeams()
  .then(() => {
    console.log('✅ Preview completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Preview failed:', error);
    process.exit(1);
  });
