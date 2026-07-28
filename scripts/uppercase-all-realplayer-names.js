/**
 * Convert All Real Player Names to UPPERCASE
 * 
 * This script updates player names to full uppercase across:
 * 1. Neon Tournament DB:
 *    - realplayerstats table (player_name column)
 *    - player_seasons table (player_name column if exists)
 * 2. Firebase:
 *    - realplayers collection (name, display_name fields)
 *    - realplayerstats collection (player_name field)
 * 
 * Usage: node scripts/uppercase-all-realplayer-names.js
 */

const admin = require('firebase-admin');
const readline = require('readline');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && 
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL && 
      process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    });
    console.log('✅ Firebase Admin initialized');
  } else {
    console.error('❌ Error: Firebase Admin credentials not found!');
    process.exit(1);
  }
}

const db = admin.firestore();

// Initialize Neon
const tournamentSql = process.env.NEON_TOURNAMENT_DB_URL ? neon(process.env.NEON_TOURNAMENT_DB_URL) : null;
if (!tournamentSql) {
  console.error('❌ Error: NEON_TOURNAMENT_DB_URL not found!');
  process.exit(1);
}
console.log('✅ Neon Tournament DB initialized');

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise(resolve => rl.question(query, resolve));
};

async function uppercaseAllNames() {
  console.log('\n' + '='.repeat(80));
  console.log('🔠 CONVERT ALL REAL PLAYER NAMES TO UPPERCASE');
  console.log('='.repeat(80));
  console.log('\nThis script will convert all player names to UPPERCASE.\n');
  
  try {
    // Step 1: Get unique player names from Firebase realplayers
    console.log('1️⃣ Fetching all players from Firebase...\n');
    
    const realplayersSnapshot = await db.collection('realplayers').get();
    
    if (realplayersSnapshot.empty) {
      console.log('❌ No real players found in Firebase');
      rl.close();
      return;
    }
    
    const playersToUpdate = [];
    realplayersSnapshot.forEach(doc => {
      const data = doc.data();
      const currentName = data.name || data.display_name || '';
      const uppercaseName = currentName.toUpperCase();
      
      if (currentName !== uppercaseName) {
        playersToUpdate.push({
          docId: doc.id,
          playerId: data.player_id,
          oldName: currentName,
          newName: uppercaseName
        });
      }
    });
    
    console.log(`Found ${realplayersSnapshot.size} total players`);
    console.log(`${playersToUpdate.length} players need name updates\n`);
    
    if (playersToUpdate.length === 0) {
      console.log('✅ All player names are already in UPPERCASE!');
      rl.close();
      return;
    }
    
    // Show preview
    console.log('Preview of changes (first 20):');
    playersToUpdate.slice(0, 20).forEach((player, idx) => {
      console.log(`  ${idx + 1}. "${player.oldName}" → "${player.newName}" (${player.playerId})`);
    });
    
    if (playersToUpdate.length > 20) {
      console.log(`  ... and ${playersToUpdate.length - 20} more\n`);
    }
    
    // Step 2: Get stats count from Neon
    console.log('\n2️⃣ Checking Neon Tournament DB tables...\n');
    
    // Check realplayerstats
    const realplayerstatsCount = await tournamentSql`
      SELECT COUNT(*) as count 
      FROM realplayerstats 
      WHERE player_name != UPPER(player_name)
    `;
    
    console.log(`Neon realplayerstats: ${realplayerstatsCount[0].count} records need updates`);
    
    // Check player_seasons table
    const playerSeasonsExists = await tournamentSql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'player_seasons'
      ) as exists
    `;
    
    let playerSeasonsCount = 0;
    if (playerSeasonsExists[0].exists) {
      const hasPlayerNameCol = await tournamentSql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'player_seasons' 
          AND column_name = 'player_name'
        ) as exists
      `;
      
      if (hasPlayerNameCol[0].exists) {
        const psCount = await tournamentSql`
          SELECT COUNT(*) as count 
          FROM player_seasons 
          WHERE player_name != UPPER(player_name)
        `;
        playerSeasonsCount = psCount[0].count;
        console.log(`Neon player_seasons: ${playerSeasonsCount} records need updates`);
      }
    }
    
    // Check for any other tables with player_name column (excluding football players)
    const otherTables = await tournamentSql`
      SELECT DISTINCT table_name 
      FROM information_schema.columns 
      WHERE column_name = 'player_name' 
      AND table_name NOT IN ('realplayerstats', 'player_seasons')
      AND table_name NOT LIKE '%football%'
      AND table_name NOT LIKE '%efootball%'
      AND table_schema = 'public'
    `;
    
    const otherTablesUpdates = [];
    for (const table of otherTables) {
      const tableName = table.table_name;
      try {
        const count = await tournamentSql.unsafe(`
          SELECT COUNT(*) as count 
          FROM ${tableName} 
          WHERE player_name != UPPER(player_name)
        `);
        if (count[0].count > 0) {
          otherTablesUpdates.push({
            table: tableName,
            count: count[0].count
          });
          console.log(`Neon ${tableName}: ${count[0].count} records need updates`);
        }
      } catch (e) {
        console.log(`   (Skipped ${tableName} - error checking)`);
      }
    }
    
    // Step 3: Get Firebase realplayerstats count
    console.log('\n3️⃣ Checking Firebase realplayerstats...\n');
    
    const fbStatsSnapshot = await db.collection('realplayerstats').get();
    let fbStatsToUpdate = 0;
    
    fbStatsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.player_name && data.player_name !== data.player_name.toUpperCase()) {
        fbStatsToUpdate++;
      }
    });
    
    console.log(`Firebase realplayerstats: ${fbStatsToUpdate} records need updates`);
    
    // Step 4: Show summary and confirm
    console.log('\n' + '='.repeat(80));
    console.log('📋 UPDATE SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nFirebase realplayers: ${playersToUpdate.length} players`);
    console.log(`Neon realplayerstats: ${realplayerstatsCount[0].count} records`);
    if (playerSeasonsCount > 0) {
      console.log(`Neon player_seasons: ${playerSeasonsCount} records`);
    }
    if (otherTablesUpdates.length > 0) {
      otherTablesUpdates.forEach(t => {
        console.log(`Neon ${t.table}: ${t.count} records`);
      });
    }
    console.log(`Firebase realplayerstats: ${fbStatsToUpdate} records`);
    
    const totalOtherTables = otherTablesUpdates.reduce((sum, t) => sum + t.count, 0);
    console.log(`\nTotal updates: ${playersToUpdate.length + parseInt(realplayerstatsCount[0].count) + playerSeasonsCount + fbStatsToUpdate + totalOtherTables}`);
    
    const confirm = await question('\n❓ Proceed with updates? (type "yes" to confirm): ');
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled');
      rl.close();
      return;
    }
    
    console.log('\n🔄 Starting update process...\n');
    
    // Step 5: Update Firebase realplayers
    console.log('4️⃣ Updating Firebase realplayers...');
    
    let fbPlayersUpdated = 0;
    const batchSize = 500;
    
    for (let i = 0; i < playersToUpdate.length; i += batchSize) {
      const batch = db.batch();
      const chunk = playersToUpdate.slice(i, i + batchSize);
      
      for (const player of chunk) {
        const docRef = db.collection('realplayers').doc(player.docId);
        batch.update(docRef, {
          name: player.newName,
          display_name: player.newName,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      await batch.commit();
      fbPlayersUpdated += chunk.length;
      console.log(`   Updated ${fbPlayersUpdated}/${playersToUpdate.length} players...`);
    }
    
    console.log(`   ✅ Updated ${fbPlayersUpdated} Firebase realplayers\n`);
    
    // Step 6: Update Neon realplayerstats
    console.log('5️⃣ Updating Neon realplayerstats...');
    
    await tournamentSql`
      UPDATE realplayerstats
      SET 
        player_name = UPPER(player_name),
        updated_at = NOW()
      WHERE player_name != UPPER(player_name)
    `;
    
    console.log(`   ✅ Updated ${realplayerstatsCount[0].count} Neon realplayerstats records\n`);
    
    // Step 7: Update Neon player_seasons (if exists)
    if (playerSeasonsCount > 0) {
      console.log('6️⃣ Updating Neon player_seasons...');
      
      await tournamentSql`
        UPDATE player_seasons
        SET 
          player_name = UPPER(player_name),
          updated_at = NOW()
        WHERE player_name != UPPER(player_name)
      `;
      
      console.log(`   ✅ Updated ${playerSeasonsCount} Neon player_seasons records\n`);
    }
    
    // Step 8: Update other tables with player_name
    if (otherTablesUpdates.length > 0) {
      console.log('7️⃣ Updating other Neon tables...');
      
      for (const tableInfo of otherTablesUpdates) {
        try {
          await tournamentSql.unsafe(`
            UPDATE ${tableInfo.table}
            SET 
              player_name = UPPER(player_name),
              updated_at = NOW()
            WHERE player_name != UPPER(player_name)
          `);
          console.log(`   ✅ Updated ${tableInfo.count} records in ${tableInfo.table}`);
        } catch (e) {
          console.log(`   ⚠️  Error updating ${tableInfo.table}: ${e.message}`);
        }
      }
      console.log();
    }
    
    // Step 9: Update Firebase realplayerstats
    const stepNum = 8 + (otherTablesUpdates.length > 0 ? 1 : 0);
    console.log(`${stepNum}️⃣ Updating Firebase realplayerstats...`);
    
    const fbStatsAll = await db.collection('realplayerstats').get();
    let fbStatsUpdated = 0;
    let batchIndex = 0;
    let batch = db.batch();
    
    for (const doc of fbStatsAll.docs) {
      const data = doc.data();
      if (data.player_name && data.player_name !== data.player_name.toUpperCase()) {
        batch.update(doc.ref, {
          player_name: data.player_name.toUpperCase(),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        batchIndex++;
        fbStatsUpdated++;
        
        // Commit batch every 500 operations
        if (batchIndex >= 500) {
          await batch.commit();
          batch = db.batch();
          batchIndex = 0;
          console.log(`   Updated ${fbStatsUpdated} records...`);
        }
      }
    }
    
    // Commit remaining
    if (batchIndex > 0) {
      await batch.commit();
    }
    
    console.log(`   ✅ Updated ${fbStatsUpdated} Firebase realplayerstats records\n`);
    
    console.log('✅ All updates complete!\n');
    console.log('📝 Summary:');
    console.log(`   - Firebase realplayers: ${fbPlayersUpdated} updated`);
    console.log(`   - Neon realplayerstats: ${realplayerstatsCount[0].count} updated`);
    if (playerSeasonsCount > 0) {
      console.log(`   - Neon player_seasons: ${playerSeasonsCount} updated`);
    }
    if (otherTablesUpdates.length > 0) {
      otherTablesUpdates.forEach(t => {
        console.log(`   - Neon ${t.table}: ${t.count} updated`);
      });
    }
    console.log(`   - Firebase realplayerstats: ${fbStatsUpdated} updated`);
    console.log('\n📝 Next steps:');
    console.log('   1. Verify player names in admin panel');
    console.log('   2. Check a few player pages to confirm uppercase names');
    console.log('   3. Test search functionality with uppercase names\n');
    
  } catch (error) {
    console.error('❌ Error during update:', error);
    console.error(error.stack);
  }
  
  rl.close();
}

// Run the script
uppercaseAllNames().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
