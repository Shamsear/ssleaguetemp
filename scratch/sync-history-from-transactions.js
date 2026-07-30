const admin = require('firebase-admin');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
  } else {
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
    });
  }
}

const db = admin.firestore();
const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);

async function syncHistory() {
  try {
    console.log("=== 1. FETCHING DATA ===");
    // Get player mappings
    const fpRows = await sql`SELECT id, player_id, name FROM footballplayers`;
    const idToCode = new Map();
    const codeToId = new Map();
    const idToName = new Map();
    fpRows.forEach(p => {
      if (p.id) idToName.set(p.id.toString(), p.name);
      if (p.id && p.player_id) {
        idToCode.set(p.id.toString(), p.player_id.toString().toLowerCase());
        codeToId.set(p.player_id.toString().toLowerCase(), p.id.toString());
      }
    });
    console.log(`Loaded ${fpRows.length} player mappings.`);

    // Get Firestore player_transactions
    const playerTxnsSnap = await db.collection('player_transactions').get();
    const playerTxns = playerTxnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Loaded ${playerTxns.length} documents from player_transactions.`);

    // Get Firestore transactions (filter for transfer/swap/release)
    const txnsSnap = await db.collection('transactions').get();
    const txns = txnsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => ['release', 'transfer', 'swap', 'player_transfer', 'player_swap'].includes(t.transaction_type));
    console.log(`Loaded ${txns.length} relevant documents from transactions.`);

    // Get current player_history
    const history = await sql`SELECT * FROM player_history`;
    console.log(`Loaded ${history.length} records from player_history.`);

    console.log("\n=== 2. PROCESSING ALIGNMENT AND RECONSTRUCTION ===");
    let createdCount = 0;
    let updatedCount = 0;

    // A helper to format timestamps safely
    const getJsDate = (timestamp) => {
      if (!timestamp) return new Date();
      if (timestamp.toDate) return timestamp.toDate();
      if (timestamp._seconds) return new Date(timestamp._seconds * 1000);
      if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
      return new Date(timestamp);
    };

    // 1. Process player swaps from player_transactions
    console.log("\n--- Processing Swaps from player_transactions ---");
    for (const txn of playerTxns) {
      if (txn.transaction_type === 'swap') {
        const playerA_Code = txn.player_a_id ? txn.player_a_id.toString().toLowerCase() : '';
        const playerB_Code = txn.player_b_id ? txn.player_b_id.toString().toLowerCase() : '';
        const playerA_Id = codeToId.get(playerA_Code) || playerA_Code;
        const playerB_Id = codeToId.get(playerB_Code) || playerB_Code;
        const date = getJsDate(txn.created_at || txn.date);
        
        console.log(`Processing Swap: ${txn.player_a_name} ↔ ${txn.player_b_name} on ${date.toISOString().split('T')[0]}`);

        // Close Player A's active history on Team A
        const closedA = await sql`
          UPDATE player_history
          SET status = 'swapped', end_date = ${date}, end_reason = 'swap', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
          WHERE player_id = ${playerA_Code} AND team_id = ${txn.team_a_id} AND status = 'active'
          RETURNING id
        `;
        if (closedA.length > 0) updatedCount++;

        // Close Player B's active history on Team B
        const closedB = await sql`
          UPDATE player_history
          SET status = 'swapped', end_date = ${date}, end_reason = 'swap', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
          WHERE player_id = ${playerB_Code} AND team_id = ${txn.team_b_id} AND status = 'active'
          RETURNING id
        `;
        if (closedB.length > 0) updatedCount++;

        // Insert new active history for Player A on Team B
        // First check if already exists
        const existsA = await sql`
          SELECT id FROM player_history WHERE player_id = ${playerA_Code} AND team_id = ${txn.team_b_id} AND season_id = ${txn.season_id || 'SSPSLS16'} AND status = 'active'
        `;
        if (existsA.length === 0) {
          await sql`
            INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
            VALUES (${playerA_Code}, ${txn.player_a_name}, ${txn.team_b_id}, ${txn.team_b_name || 'Unknown Team'}, ${txn.season_id || 'SSPSLS16'}, 'swap', ${txn.fee_team_b || 0}, 'active', ${date}, ${txn.season_id || 'SSPSLS16'}, ${txn.season_id || 'SSPSLS16'})
          `;
          createdCount++;
        }

        // Insert new active history for Player B on Team A
        const existsB = await sql`
          SELECT id FROM player_history WHERE player_id = ${playerB_Code} AND team_id = ${txn.team_a_id} AND season_id = ${txn.season_id || 'SSPSLS16'} AND status = 'active'
        `;
        if (existsB.length === 0) {
          await sql`
            INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
            VALUES (${playerB_Code}, ${txn.player_b_name}, ${txn.team_a_id}, ${txn.team_a_name || 'Unknown Team'}, ${txn.season_id || 'SSPSLS16'}, 'swap', ${txn.fee_team_a || 0}, 'active', ${date}, ${txn.season_id || 'SSPSLS16'}, ${txn.season_id || 'SSPSLS16'})
          `;
          createdCount++;
        }
      }
    }

    // 2. Process releases and transfers from transactions collection
    console.log("\n--- Processing Transfers and Releases from transactions collection ---");
    for (const txn of txns) {
      const pId = txn.metadata?.player_id || txn.player_id || '';
      const pCode = idToCode.get(pId.toString()) || pId.toString().toLowerCase();
      const pName = txn.metadata?.player_name || txn.player_name || idToName.get(pId.toString()) || 'Unknown Player';
      const date = getJsDate(txn.created_at);

      if (txn.transaction_type === 'release') {
        console.log(`Processing Release: ${pName} from team ${txn.team_id} on ${date.toISOString().split('T')[0]}`);
        const closed = await sql`
          UPDATE player_history
          SET status = 'released', end_date = ${date}, end_reason = 'release', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
          WHERE player_id = ${pCode} AND team_id = ${txn.team_id} AND status = 'active'
          RETURNING id
        `;
        if (closed.length > 0) updatedCount++;
      } 
      else if (txn.transaction_type === 'transfer' || txn.transaction_type === 'player_transfer') {
        const oldTeamId = txn.old_team_id || txn.team_id;
        const newTeamId = txn.new_team_id;
        console.log(`Processing Transfer: ${pName} from ${oldTeamId} ↔ ${newTeamId} on ${date.toISOString().split('T')[0]}`);

        // Close old active
        if (oldTeamId) {
          const closed = await sql`
            UPDATE player_history
            SET status = 'transferred', end_date = ${date}, end_reason = 'transfer', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
            WHERE player_id = ${pCode} AND team_id = ${oldTeamId} AND status = 'active'
            RETURNING id
          `;
          if (closed.length > 0) updatedCount++;
        }

        // Create new active
        if (newTeamId) {
          const exists = await sql`
            SELECT id FROM player_history WHERE player_id = ${pCode} AND team_id = ${newTeamId} AND season_id = ${txn.season_id || 'SSPSLS16'} AND status = 'active'
          `;
          if (exists.length === 0) {
            await sql`
              INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
              VALUES (${pCode}, ${pName}, ${newTeamId}, 'Unknown Team', ${txn.season_id || 'SSPSLS16'}, 'transfer', ${txn.amount || txn.cost_to_new_team || 0}, 'active', ${date}, ${txn.season_id || 'SSPSLS16'}, ${txn.season_id || 'SSPSLS16'})
            `;
            createdCount++;
          }
        }
      }
    }

    console.log(`\n⭐ SWEEP COMPLETED SUCCESSFULLY.`);
    console.log(`Reconstructed & Created: ${createdCount} history timeline records.`);
    console.log(`Realigned & Closed: ${updatedCount} old history records.`);

  } catch (err) {
    console.error(err);
  }
}
syncHistory();
