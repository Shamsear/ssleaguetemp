/**
 * Backfill player_history table specifically for season S18 (SSPSLS18)
 */

require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  } else {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    admin.initializeApp({ projectId });
  }
}

const db = admin.firestore();
const sql = neon(process.env.NEON_DATABASE_URL);

async function backfillS18History() {
  console.log('\n🔄 Starting targeted player_history backfill for season S18 (SSPSLS18)...\n');

  const stats = {
    auctions: 0,
    releases: 0,
    transfers: 0,
    swaps: 0,
    activeContracts: 0,
    skipped: 0,
    errors: 0
  };

  try {
    // 1. Fetch team names mapping from postgres database to prevent null violations
    console.log('📥 Fetching all active teams from database...');
    const dbTeams = await sql`SELECT id, name FROM teams WHERE season_id = 'SSPSLS18'`;
    const teamNamesMap = {};
    dbTeams.forEach(t => {
      teamNamesMap[t.id] = t.name || 'Unknown Team';
    });
    console.log(`   Cached ${Object.keys(teamNamesMap).length} team names.\n`);

    // 2. Clean up existing S18 records to allow clean idempotency
    console.log('🧹 Cleaning up existing S18 records in player_history...');
    const deleteRes = await sql`DELETE FROM player_history WHERE season_id = 'SSPSLS18'`;
    console.log(`   Deleted ${deleteRes.count} existing S18 history records.\n`);

    // 3. Get and sort S18 transactions
    console.log('📥 Fetching transactions for season S18...');
    const transactionsSnapshot = await db.collection('transactions')
      .where('season_id', '==', 'SSPSLS18')
      .get();

    console.log(`   Found ${transactionsSnapshot.size} transactions for S18.`);

    const transactions = transactionsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
        const bTime = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
        return aTime - bTime;
      });

    // 4. Process each transaction
    console.log('⚙️ Processing S18 transactions...');
    for (const txn of transactions) {
      try {
        const transactionType = txn.transaction_type || txn.type;
        
        if (transactionType === 'release' || transactionType === 'player_release_refund' || transactionType === 'release_refund') {
          if (!txn.player_id || !txn.player_name) continue;
          if (txn.player_type !== 'football') continue;
          
          const closeResult = await sql`
            UPDATE player_history
            SET 
              status = 'released',
              end_date = ${txn.created_at?.toDate ? txn.created_at.toDate() : new Date()},
              end_reason = 'release',
              transaction_id = ${txn.id}
            WHERE player_id = ${txn.player_id}
            AND team_id = ${txn.team_id}
            AND season_id = 'SSPSLS18'
            AND status = 'active'
          `;
          
          if (closeResult.count > 0) {
            stats.releases++;
          }

        } else if (transactionType === 'player_transfer') {
          if (!txn.player_id || !txn.player_name) continue;
          
          const fromTeamId = txn.from_team_id || txn.team_id;
          const toTeamId = txn.to_team_id || txn.team_id;
          const toTeamName = txn.to_team_name || txn.team_name || teamNamesMap[toTeamId] || 'Unknown Team';

          await sql`
            UPDATE player_history
            SET 
              status = 'transferred',
              end_date = ${txn.created_at?.toDate ? txn.created_at.toDate() : new Date()},
              end_reason = 'transfer'
            WHERE player_id = ${txn.player_id}
            AND team_id = ${fromTeamId}
            AND season_id = 'SSPSLS18'
            AND status = 'active'
          `;

          await sql`
            INSERT INTO player_history (
              player_id,
              player_name,
              position,
              team_id,
              team_name,
              season_id,
              acquisition_type,
              acquisition_value,
              acquisition_date,
              transaction_id,
              status
            ) VALUES (
              ${txn.player_id},
              ${txn.player_name},
              ${txn.position || null},
              ${toTeamId},
              ${toTeamName},
              'SSPSLS18',
              'transfer',
              ${txn.amount || txn.value || 0},
              ${txn.created_at?.toDate ? txn.created_at.toDate() : new Date()},
              ${txn.id},
              'active'
            )
            ON CONFLICT DO NOTHING
          `;
          stats.transfers++;

        } else if (transactionType === 'player_swap') {
          if (!txn.player_id || !txn.player_name) continue;
          stats.swaps++;
        }

      } catch (error) {
        stats.errors++;
        console.error(`Error processing transaction ${txn.id}:`, error.message);
      }
    }

    console.log(`\n📊 Transaction processing complete!`);
    console.log(`   Releases: ${stats.releases}`);
    console.log(`   Transfers: ${stats.transfers}`);
    console.log(`   Swaps: ${stats.swaps}`);
    console.log(`   Errors: ${stats.errors}\n`);

    // 5. Add any active S18 contracts from footballplayers
    console.log('🔄 Adding current active S18 contracts from footballplayers...\n');

    const activePlayers = await sql`
      SELECT 
        id,
        player_id,
        name,
        position,
        team_id,
        team_name,
        season_id,
        acquisition_value,
        round_id
      FROM footballplayers
      WHERE is_sold = true AND season_id = 'SSPSLS18'
    `;

    console.log(`   Found ${activePlayers.length} active players on rosters in S18.`);

    for (const player of activePlayers) {
      try {
        const pId = player.player_id || player.id;
        // Check if already has an active history record in S18
        const existing = await sql`
          SELECT id FROM player_history
          WHERE player_id = ${pId}
          AND team_id = ${player.team_id}
          AND season_id = 'SSPSLS18'
          AND status = 'active'
        `;

        if (existing.length === 0) {
          const resolvedTeamName = player.team_name || teamNamesMap[player.team_id] || 'Unknown Team';
          await sql`
            INSERT INTO player_history (
              player_id,
              player_name,
              position,
              team_id,
              team_name,
              season_id,
              acquisition_type,
              acquisition_value,
              round_id,
              status
            ) VALUES (
              ${pId},
              ${player.name},
              ${player.position},
              ${player.team_id},
              ${resolvedTeamName},
              'SSPSLS18',
              'auction',
              ${player.acquisition_value || 0},
              ${player.round_id || null},
              'active'
            )
          `;
          stats.activeContracts++;
        } else {
          stats.skipped++;
        }

      } catch (error) {
        stats.errors++;
        console.error(`Error adding active contract for player ${player.name}:`, error.message);
      }
    }

    console.log('\n✅ Targeted Backfill Complete!');
    console.log('\n📊 FINAL SUMMARY:');
    console.log(`   Releases: ${stats.releases}`);
    console.log(`   Transfers: ${stats.transfers}`);
    console.log(`   Swaps: ${stats.swaps}`);
    console.log(`   Active contracts added: ${stats.activeContracts}`);
    console.log(`   Skipped (already exist): ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}\n`);

  } catch (error) {
    console.error('❌ Error during targeted backfill:', error);
    throw error;
  }
}

backfillS18History()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
