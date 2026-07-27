/**
 * Merge two real players in Firebase
 * This script merges sspslpsl0251 into sspslpsl0038 and deletes the first
 */

const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    
    if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_ADMIN_PROJECT_ID}-default-rtdb.firebaseio.com`,
      });
      console.log('✅ Firebase Admin initialized with service account');
    } else if (projectId) {
      admin.initializeApp({
        projectId: projectId,
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
      });
      console.log(`✅ Firebase Admin initialized with project ID: ${projectId}`);
    } else {
      admin.initializeApp();
      console.log('✅ Firebase Admin initialized with default credentials');
    }
  } catch (error) {
    console.error('❌ Firebase admin initialization error:', error);
    throw new Error('Failed to initialize Firebase Admin SDK');
  }
}

const db = admin.firestore();

// Tournament Neon connection
const { neon } = require('@neondatabase/serverless');
const tournamentSql = neon(process.env.NEON_TOURNAMENT_DB_URL, {
  fetchConnectionTimeout: 30000,
  connectionTimeout: 30000,
  fetchOptions: { cache: 'no-store' },
});

async function mergePlayers() {
  const sourcePlayerId = 'sspslpsl0251'; // Player to be deleted
  const targetPlayerId = 'sspslpsl0038'; // Player to keep (Abdul Rouf)

  console.log(`\n🔄 Starting merge: ${sourcePlayerId} → ${targetPlayerId}\n`);

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. Fetch both player documents from Firebase
    // ═══════════════════════════════════════════════════════════════════════
    console.log('📖 Fetching player documents from Firebase...');
    
    const sourceSnapshot = await db.collection('realplayers')
      .where('player_id', '==', sourcePlayerId)
      .limit(1)
      .get();

    const targetSnapshot = await db.collection('realplayers')
      .where('player_id', '==', targetPlayerId)
      .limit(1)
      .get();

    if (sourceSnapshot.empty) {
      console.log(`❌ Source player ${sourcePlayerId} not found in Firebase`);
      return;
    }

    if (targetSnapshot.empty) {
      console.log(`❌ Target player ${targetPlayerId} not found in Firebase`);
      return;
    }

    const sourceDoc = sourceSnapshot.docs[0];
    const targetDoc = targetSnapshot.docs[0];
    const sourceData = sourceDoc.data();
    const targetData = targetDoc.data();

    console.log(`✅ Source: ${sourceData.name} (${sourcePlayerId})`);
    console.log(`✅ Target: ${targetData.name} (${targetPlayerId})`);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Update realplayerstats in Tournament DB
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking realplayerstats in Tournament database...');
    
    const statsRows = await tournamentSql`
      SELECT id, player_id, season_id, tournament_id, matches_played, goals_scored, points
      FROM realplayerstats
      WHERE player_id = ${sourcePlayerId}
    `;

    if (statsRows.length > 0) {
      console.log(`📝 Found ${statsRows.length} stat record(s) for ${sourcePlayerId}`);
      
      for (const row of statsRows) {
        console.log(`   → Processing ${row.id} (Season: ${row.season_id}, Tournament: ${row.tournament_id})`);
        
        // Check if target player already has stats for this season/tournament
        const existingTarget = await tournamentSql`
          SELECT id FROM realplayerstats
          WHERE player_id = ${targetPlayerId}
            AND season_id = ${row.season_id}
            AND tournament_id = ${row.tournament_id}
        `;

        if (existingTarget.length > 0) {
          console.log(`   ⚠️  Target player already has stats - merging and deleting source`);
          // Merge stats by summing values
          await tournamentSql`
            UPDATE realplayerstats
            SET matches_played = matches_played + ${row.matches_played || 0},
                goals_scored = goals_scored + ${row.goals_scored || 0},
                points = points + ${row.points || 0},
                updated_at = NOW()
            WHERE id = ${existingTarget[0].id}
          `;
          await tournamentSql`DELETE FROM realplayerstats WHERE id = ${row.id}`;
        } else {
          console.log(`   ✅ Updating stats to use target player`);
          const newId = row.id.replace(sourcePlayerId, targetPlayerId);
          await tournamentSql`
            UPDATE realplayerstats
            SET id = ${newId}, player_id = ${targetPlayerId}, player_name = ${targetData.name}, updated_at = NOW()
            WHERE id = ${row.id}
          `;
        }
      }
    } else {
      console.log(`   ℹ️  No stats found for ${sourcePlayerId}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Update player_seasons
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking player_seasons...');
    
    const seasonRows = await tournamentSql`
      SELECT id, player_id, season_id FROM player_seasons WHERE player_id = ${sourcePlayerId}
    `;

    if (seasonRows.length > 0) {
      console.log(`📝 Found ${seasonRows.length} player_season(s) for ${sourcePlayerId}`);
      for (const row of seasonRows) {
        const existingTarget = await tournamentSql`
          SELECT id FROM player_seasons WHERE player_id = ${targetPlayerId} AND season_id = ${row.season_id}
        `;
        if (existingTarget.length > 0) {
          console.log(`   ⚠️  Deleting duplicate season ${row.season_id}`);
          await tournamentSql`DELETE FROM player_seasons WHERE id = ${row.id}`;
        } else {
          console.log(`   ✅ Updating season ${row.season_id}`);
          const newId = row.id.replace(sourcePlayerId, targetPlayerId);
          await tournamentSql`
            UPDATE player_seasons SET id = ${newId}, player_id = ${targetPlayerId} WHERE id = ${row.id}
          `;
        }
      }
    } else {
      console.log(`   ℹ️  No player_seasons found`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. Update team_players
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking team_players...');
    
    const teamPlayerRows = await tournamentSql`
      SELECT id FROM team_players WHERE player_id = ${sourcePlayerId}
    `;

    if (teamPlayerRows.length > 0) {
      console.log(`📝 Found ${teamPlayerRows.length} team_player record(s)`);
      await tournamentSql`UPDATE team_players SET player_id = ${targetPlayerId} WHERE player_id = ${sourcePlayerId}`;
      console.log(`   ✅ Updated all records`);
    } else {
      console.log(`   ℹ️  No team_players found`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. Update player_awards
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking player_awards...');
    
    const awardRows = await tournamentSql`
      SELECT id FROM player_awards WHERE player_id = ${sourcePlayerId}
    `;

    if (awardRows.length > 0) {
      console.log(`📝 Found ${awardRows.length} award(s)`);
      await tournamentSql`UPDATE player_awards SET player_id = ${targetPlayerId}, player_name = ${targetData.name} WHERE player_id = ${sourcePlayerId}`;
      console.log(`   ✅ Updated all awards`);
    } else {
      console.log(`   ℹ️  No awards found`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. Update matchups (home/away player IDs)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking matchups...');
    
    const matchupRows = await tournamentSql`
      SELECT id FROM matchups 
      WHERE home_player_id = ${sourcePlayerId} 
         OR away_player_id = ${sourcePlayerId}
         OR home_original_player_id = ${sourcePlayerId}
         OR away_original_player_id = ${sourcePlayerId}
    `;

    if (matchupRows.length > 0) {
      console.log(`📝 Found ${matchupRows.length} matchup(s)`);
      await tournamentSql`
        UPDATE matchups 
        SET home_player_id = CASE WHEN home_player_id = ${sourcePlayerId} THEN ${targetPlayerId} ELSE home_player_id END,
            away_player_id = CASE WHEN away_player_id = ${sourcePlayerId} THEN ${targetPlayerId} ELSE away_player_id END,
            home_original_player_id = CASE WHEN home_original_player_id = ${sourcePlayerId} THEN ${targetPlayerId} ELSE home_original_player_id END,
            away_original_player_id = CASE WHEN away_original_player_id = ${sourcePlayerId} THEN ${targetPlayerId} ELSE away_original_player_id END,
            home_player_name = CASE WHEN home_player_id = ${sourcePlayerId} THEN ${targetData.name} ELSE home_player_name END,
            away_player_name = CASE WHEN away_player_id = ${sourcePlayerId} THEN ${targetData.name} ELSE away_player_name END,
            updated_at = NOW()
        WHERE home_player_id = ${sourcePlayerId} 
           OR away_player_id = ${sourcePlayerId}
           OR home_original_player_id = ${sourcePlayerId}
           OR away_original_player_id = ${sourcePlayerId}
      `;
      console.log(`   ✅ Updated all matchups`);
    } else {
      console.log(`   ℹ️  No matchups found`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. Update fixtures (MOTM)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking fixtures (MOTM)...');
    
    const fixtureRows = await tournamentSql`
      SELECT id FROM fixtures WHERE motm_player_id = ${sourcePlayerId}
    `;

    if (fixtureRows.length > 0) {
      console.log(`📝 Found ${fixtureRows.length} fixture(s) with MOTM`);
      await tournamentSql`
        UPDATE fixtures 
        SET motm_player_id = ${targetPlayerId}, motm_player_name = ${targetData.name}, updated_at = NOW()
        WHERE motm_player_id = ${sourcePlayerId}
      `;
      console.log(`   ✅ Updated all fixtures`);
    } else {
      console.log(`   ℹ️  No MOTM fixtures found`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. Update awards table
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking awards table...');
    
    const awardsRows = await tournamentSql`
      SELECT id FROM awards WHERE player_id = ${sourcePlayerId}
    `;

    if (awardsRows.length > 0) {
      console.log(`📝 Found ${awardsRows.length} award(s) in awards table`);
      await tournamentSql`
        UPDATE awards SET player_id = ${targetPlayerId}, player_name = ${targetData.name} WHERE player_id = ${sourcePlayerId}
      `;
      console.log(`   ✅ Updated all awards`);
    } else {
      console.log(`   ℹ️  No awards in awards table found`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. Update managers (if player_id is set)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 Checking managers...');
    
    const managerRows = await tournamentSql`
      SELECT manager_id FROM managers WHERE player_id = ${sourcePlayerId}
    `;

    if (managerRows.length > 0) {
      console.log(`📝 Found ${managerRows.length} manager record(s)`);
      await tournamentSql`UPDATE managers SET player_id = ${targetPlayerId} WHERE player_id = ${sourcePlayerId}`;
      console.log(`   ✅ Updated all manager records`);
    } else {
      console.log(`   ℹ️  No manager records found`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. Merge any additional Firebase data if needed
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 Checking for data to merge...');
    
    // If source has a photo but target doesn't, copy it
    if (sourceData.photo_url && !targetData.photo_url) {
      console.log(`   📸 Copying photo_url from source to target`);
      await targetDoc.ref.update({
        photo_url: sourceData.photo_url,
        ...(sourceData.photo_file_id ? { photo_file_id: sourceData.photo_file_id } : {}),
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. Delete source player from Firebase
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n🗑️  Deleting source player ${sourcePlayerId} from Firebase...`);
    await sourceDoc.ref.delete();
    console.log(`   ✅ Deleted successfully`);

    // ═══════════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(60)}`);
    console.log('✅ MERGE COMPLETED SUCCESSFULLY');
    console.log(`${'═'.repeat(60)}`);
    console.log(`Source player ${sourcePlayerId} merged into ${targetPlayerId} (${targetData.name})`);
    console.log(`Source player document deleted from Firebase`);
    console.log(`\nTournament database tables updated:`);
    console.log(`  - realplayerstats: ${statsRows.length} record(s)`);
    console.log(`  - player_seasons: ${seasonRows.length} record(s)`);
    console.log(`  - team_players: ${teamPlayerRows.length} record(s)`);
    console.log(`  - player_awards: ${awardRows.length} record(s)`);
    console.log(`  - matchups: ${matchupRows.length} record(s)`);
    console.log(`  - fixtures: ${fixtureRows.length} record(s)`);
    console.log(`  - awards: ${awardsRows.length} record(s)`);
    console.log(`  - managers: ${managerRows.length} record(s)`);
    console.log(`${'═'.repeat(60)}\n`);

  } catch (error) {
    console.error('\n❌ Error during merge:', error);
    throw error;
  }
}

// Run the merge
mergePlayers()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
