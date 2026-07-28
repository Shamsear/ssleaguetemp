/**
 * Split Player 55 Stats - SANJU vs SANJU K
 * 
 * This script fixes an issue where Player 55 (sspslpsl0055) has stats from two different players:
 * - SANJU: Has stats from S12, S11, S10, S9, S8 (needs to be moved to a new player)
 * - SANJU K: Current player 55 should keep only their own stats (S13+)
 * 
 * The script will:
 * 1. Create a new player "SANJU" in Firebase
 * 2. Transfer stats from S12-S8 to the new player in Neon
 * 3. Rename player 55 to "SANJU K" in Firebase and Neon
 * 4. Update Firebase realplayerstats references
 * 
 * Usage: node scripts/fix-player-55-sanju-split.js
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

async function fixPlayer55() {
  console.log('\n' + '='.repeat(80));
  console.log('🔀 FIX PLAYER 55 - SPLIT SANJU & SANJU K');
  console.log('='.repeat(80));
  console.log('\nThis script will separate stats of SANJU and SANJU K.\n');
  
  const PLAYER_55_ID = 'sspslpsl0055';
  const SEASONS_TO_TRANSFER = ['SSPSLS12', 'SSPSLS11', 'SSPSLS10', 'SSPSLS9', 'SSPSLS8'];
  
  // Step 1: Find Player 55 in Firebase
  console.log('1️⃣ Looking for Player 55 in Firebase...\n');
  
  const player55Snapshot = await db.collection('realplayers')
    .where('player_id', '==', PLAYER_55_ID)
    .get();
  
  if (player55Snapshot.empty) {
    console.log('❌ Could not find player with ID:', PLAYER_55_ID);
    rl.close();
    return;
  }
  
  let player55Doc;
  let player55Data;
  player55Snapshot.forEach(doc => {
    player55Doc = doc;
    player55Data = doc.data();
  });
  
  console.log(`✅ Found Player: ${player55Data.name || player55Data.display_name} (${PLAYER_55_ID})\n`);
  
  // Step 2: Get stats from Neon
  console.log('2️⃣ Fetching stats from Neon Tournament DB...\n');
  
  const allStats = await tournamentSql`
    SELECT 
      id,
      player_id,
      player_name,
      team,
      team_id,
      tournament_id,
      season_id,
      matches_played,
      goals_scored,
      assists,
      clean_sheets,
      created_at
    FROM realplayerstats 
    WHERE player_id = ${PLAYER_55_ID}
    ORDER BY season_id DESC, created_at ASC
  `;
  
  if (allStats.length === 0) {
    console.log('❌ No stats found for this player in Tournament DB');
    rl.close();
    return;
  }
  
  console.log(`Found ${allStats.length} stat record(s) in Tournament DB:\n`);
  
  // Separate stats by season
  const statsToTransfer = allStats.filter(stat => {
    const seasonMatch = stat.season_id?.match(/S(\d+)/);
    if (seasonMatch) {
      const seasonNum = parseInt(seasonMatch[1]);
      return seasonNum >= 8 && seasonNum <= 12;
    }
    return SEASONS_TO_TRANSFER.includes(stat.season_id);
  });
  
  const statsToKeep = allStats.filter(stat => !statsToTransfer.includes(stat));
  
  console.log('Stats to transfer to SANJU (S12-S8):');
  statsToTransfer.forEach(stat => {
    console.log(`   - ${stat.season_id || stat.tournament_id}: ${stat.team || 'N/A'} - ${stat.matches_played} matches, ${stat.goals_scored} goals`);
  });
  
  console.log(`\nStats to keep with SANJU K (S13+):`);
  statsToKeep.forEach(stat => {
    console.log(`   - ${stat.season_id || stat.tournament_id}: ${stat.team || 'N/A'} - ${stat.matches_played} matches, ${stat.goals_scored} goals`);
  });
  
  // Step 3: Get new player ID for SANJU
  console.log('\n3️⃣ Determining new player ID for SANJU...\n');
  
  // Find the highest player ID
  const maxIdResult = await tournamentSql`
    SELECT player_id 
    FROM realplayerstats
    WHERE player_id LIKE 'sspslpsl%'
    ORDER BY player_id DESC
    LIMIT 1
  `;
  
  let newSanjuId;
  if (maxIdResult.length > 0) {
    const lastId = maxIdResult[0].player_id;
    const numPart = parseInt(lastId.replace('sspslpsl', ''));
    newSanjuId = `sspslpsl${String(numPart + 1).padStart(4, '0')}`;
  } else {
    newSanjuId = 'sspslpsl0156'; // Fallback
  }
  
  console.log(`Suggested player ID for SANJU: ${newSanjuId}`);
  const customId = await question(`Press Enter to use this ID, or type a custom ID: `);
  
  if (customId.trim()) {
    newSanjuId = customId.trim();
  }
  
  console.log(`\n✅ Will use: ${newSanjuId} for SANJU\n`);
  
  // Step 4: Ask for additional details
  const sanjuEmail = await question('Enter email for SANJU (optional, press Enter to skip): ');
  const sanjuPhone = await question('Enter phone for SANJU (optional, press Enter to skip): ');
  
  // Step 5: Show summary and confirm
  console.log('\n' + '='.repeat(80));
  console.log('📋 SPLIT SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nNew Player: SANJU (${newSanjuId})`);
  console.log(`   - Will receive ${statsToTransfer.length} stat record(s) from S12-S8`);
  console.log(`\nExisting Player 55: SANJU K (${PLAYER_55_ID})`);
  console.log(`   - Will be renamed to "SANJU K"`);
  console.log(`   - Will keep ${statsToKeep.length} stat record(s) from S13+`);
  
  const confirm = await question('\n❓ Proceed with split? (type "yes" to confirm): ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Cancelled');
    rl.close();
    return;
  }
  
  console.log('\n🔄 Starting split process...\n');
  
  try {
    // Step 6: Create SANJU in Firebase
    console.log('4️⃣ Creating SANJU in Firebase...');
    
    const sanjuData = {
      player_id: newSanjuId,
      name: 'SANJU',
      display_name: 'SANJU',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      ...(sanjuEmail.trim() && { email: sanjuEmail.trim() }),
      ...(sanjuPhone.trim() && { phone: sanjuPhone.trim() }),
      split_note: `Split from ${PLAYER_55_ID} on ${new Date().toISOString()}`,
      original_player_id: PLAYER_55_ID,
      // Copy other relevant fields from player 55
      ...(player55Data.position && { position: player55Data.position }),
      ...(player55Data.team_id && { team_id: player55Data.team_id })
    };
    
    await db.collection('realplayers').add(sanjuData);
    console.log(`   ✅ Created SANJU (${newSanjuId})\n`);
    
    // Step 7: Rename Player 55 to SANJU K in Firebase
    console.log('5️⃣ Renaming Player 55 to SANJU K in Firebase...');
    
    await player55Doc.ref.update({
      name: 'SANJU K',
      display_name: 'SANJU K',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      rename_note: `Renamed from ${player55Data.name || 'SANJU'} on ${new Date().toISOString()}`
    });
    console.log(`   ✅ Renamed to SANJU K\n`);
    
    // Step 8: Transfer stats in Neon
    console.log('6️⃣ Transferring stats in Neon Tournament DB...');
    
    let transferredCount = 0;
    for (const stat of statsToTransfer) {
      await tournamentSql`
        UPDATE realplayerstats
        SET 
          player_id = ${newSanjuId},
          player_name = 'SANJU',
          updated_at = NOW()
        WHERE id = ${stat.id}
      `;
      transferredCount++;
    }
    
    console.log(`   ✅ Transferred ${transferredCount} stat record(s) to SANJU\n`);
    
    // Step 9: Update remaining stats to SANJU K
    console.log('7️⃣ Updating remaining stats to SANJU K...');
    
    let updatedCount = 0;
    for (const stat of statsToKeep) {
      await tournamentSql`
        UPDATE realplayerstats
        SET 
          player_name = 'SANJU K',
          updated_at = NOW()
        WHERE id = ${stat.id}
      `;
      updatedCount++;
    }
    
    console.log(`   ✅ Updated ${updatedCount} stat record(s) to SANJU K\n`);
    
    // Step 10: Update Firebase realplayerstats references
    console.log('8️⃣ Updating Firebase realplayerstats references...');
    
    const firebaseStats = await db.collection('realplayerstats')
      .where('player_id', '==', PLAYER_55_ID)
      .get();
    
    if (!firebaseStats.empty) {
      const transferredSeasonIds = new Set(statsToTransfer.map(s => s.season_id));
      const transferredTournamentIds = new Set(statsToTransfer.map(s => s.tournament_id));
      
      const batch = db.batch();
      let fbTransferred = 0;
      let fbUpdated = 0;
      
      firebaseStats.forEach(doc => {
        const data = doc.data();
        const belongsToSanju = transferredSeasonIds.has(data.season_id) || 
                              transferredTournamentIds.has(data.tournament_id);
        
        if (belongsToSanju) {
          // Transfer to SANJU
          batch.update(doc.ref, {
            player_id: newSanjuId,
            player_name: 'SANJU',
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });
          fbTransferred++;
        } else {
          // Update to SANJU K
          batch.update(doc.ref, {
            player_name: 'SANJU K',
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });
          fbUpdated++;
        }
      });
      
      await batch.commit();
      console.log(`   ✅ Transferred ${fbTransferred} Firebase stat(s) to SANJU`);
      console.log(`   ✅ Updated ${fbUpdated} Firebase stat(s) to SANJU K\n`);
    } else {
      console.log(`   ℹ️  No Firebase realplayerstats to update\n`);
    }
    
    console.log('✅ Split complete!\n');
    console.log('📝 Summary:');
    console.log(`   - SANJU (${newSanjuId}): ${statsToTransfer.length} stat records from S12-S8`);
    console.log(`   - SANJU K (${PLAYER_55_ID}): ${statsToKeep.length} stat records from S13+`);
    console.log('\n📝 Next steps:');
    console.log('   1. Verify both players appear in your admin panel');
    console.log('   2. Upload photo for SANJU at: /images/players/' + newSanjuId + '.webp');
    console.log('   3. Check player pages:');
    console.log(`      - https://ssleague.vercel.app/players/${newSanjuId}`);
    console.log(`      - https://ssleague.vercel.app/players/${PLAYER_55_ID}`);
    console.log('   4. Verify stats are correctly split\n');
    
  } catch (error) {
    console.error('❌ Error during split:', error);
    console.error(error.stack);
  }
  
  rl.close();
}

// Run the script
fixPlayer55().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
