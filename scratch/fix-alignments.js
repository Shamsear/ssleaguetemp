const { neon } = require('@neondatabase/serverless');
const admin = require('firebase-admin');
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

async function alignDatabase() {
  try {
    console.log("=== 1. FETCHING INITIAL DATABASE DATA ===");
    const fpRows = await sql`SELECT id, player_id, name FROM footballplayers`;
    const idToCode = new Map();
    const codeToId = new Map();
    const idToName = new Map();
    
    fpRows.forEach(p => {
      if (p.id) idToName.set(p.id.toString(), p.name);
      if (p.id && p.player_id) {
        const numId = p.id.toString();
        const code = p.player_id.toString().toLowerCase();
        idToCode.set(numId, code);
        codeToId.set(code, numId);
      }
    });

    // 1. Get winning bids (regular + bulk)
    const regWins = await sql`
      SELECT player_id, team_id, team_name, season_id, amount as price, round_id, 'regular' as round_type
      FROM bids
      WHERE status = 'won' AND season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    const bulkWins = await sql`
      SELECT rp.player_id, rp.winning_team_id as team_id, t.name as team_name, r.season_id, rp.round_id, rp.winning_bid as price, 'bulk' as round_type
      FROM round_players rp
      JOIN rounds r ON rp.round_id = r.id
      LEFT JOIN teams t ON rp.winning_team_id = t.id
      WHERE rp.status = 'sold' AND r.season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    const allWins = [...regWins, ...bulkWins];
    console.log(`Loaded ${allWins.length} total winning allocations to verify.`);

    // 2. Fetch rosters and history
    const teamPlayers = await sql`SELECT * FROM team_players WHERE season_id IN ('SSPSLS16', 'SSPSLS17')`;
    const history = await sql`SELECT * FROM player_history WHERE season_id IN ('SSPSLS16', 'SSPSLS17') ORDER BY acquisition_date ASC`;

    // Map history by player_id
    const historyMap = new Map();
    history.forEach(h => {
      const key = `${h.player_id}_${h.season_id}`.toLowerCase();
      if (!historyMap.has(key)) historyMap.set(key, []);
      historyMap.get(key).push(h);
    });

    console.log("\n=== 2. INITIALIZING OR RE-ALIGNING FIRST HISTORY RECORDS ===");
    let createdHistory = 0;
    let updatedHistory = 0;

    for (const win of allWins) {
      const numId = win.player_id.toString();
      const code = idToCode.get(numId) || numId;
      const playerName = idToName.get(numId) || `Player ${numId}`;
      const histKey = `${code}_${win.season_id}`.toLowerCase();
      const histRecords = historyMap.get(histKey) || [];

      if (histRecords.length === 0) {
        // Create the starting timeline record
        console.log(`[NEW STARTING HISTORY] ${playerName} -> team: ${win.team_name} (${win.team_id})`);
        await sql`
          INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
          VALUES (${code}, ${playerName}, ${win.team_id}, ${win.team_name || 'Unknown Team'}, ${win.season_id}, ${win.round_type === 'bulk' ? 'bulk' : 'auction'}, ${win.price || 0}, 'active', NOW(), ${win.season_id}, ${win.season_id})
        `;
        createdHistory++;
      } else {
        // Mismatch check on first record
        const firstRec = histRecords[0];
        if (firstRec.team_id !== win.team_id) {
          console.log(`[REALIGN STARTING HISTORY] ${playerName}: changing first record from team ${firstRec.team_id} to won team ${win.team_id} (${win.team_name})`);
          await sql`
            UPDATE player_history
            SET team_id = ${win.team_id}, team_name = ${win.team_name || 'Unknown Team'}, acquisition_type = ${win.round_type === 'bulk' ? 'bulk' : 'auction'}, acquisition_value = ${win.price || 0}, updated_at = NOW()
            WHERE id = ${firstRec.id}
          `;
          updatedHistory++;
        }
      }
    }

    console.log(`\nRealigned history results: Created ${createdHistory} start logs, updated ${updatedHistory} start logs.`);

    // 3. Sync player moves from Firebase transactions to update subsequent timeline status
    console.log("\n=== 3. SYNCING FIREBASE TRANSACTION TIMELINE MOVES ===");
    const playerTxnsSnap = await db.collection('player_transactions').get();
    const playerTxns = playerTxnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const txnsSnap = await db.collection('transactions').get();
    const txns = txnsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => ['release', 'transfer', 'swap', 'player_transfer', 'player_swap'].includes(t.transaction_type));

    const getJsDate = (timestamp) => {
      if (!timestamp) return new Date();
      if (timestamp.toDate) return timestamp.toDate();
      if (timestamp._seconds) return new Date(timestamp._seconds * 1000);
      return new Date(timestamp);
    };

    let txnUpdates = 0;
    let txnCreates = 0;

    // Process swaps
    for (const txn of playerTxns) {
      if (txn.transaction_type === 'swap') {
        const playerA_Code = txn.player_a_id ? txn.player_a_id.toString().toLowerCase() : '';
        const playerB_Code = txn.player_b_id ? txn.player_b_id.toString().toLowerCase() : '';
        const date = getJsDate(txn.created_at || txn.date);
        
        // Check if there is an active contract for Player A on Team A to close
        const closedA = await sql`
          UPDATE player_history
          SET status = 'swapped', end_date = ${date}, end_reason = 'swap', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
          WHERE player_id = ${playerA_Code} AND team_id = ${txn.team_a_id} AND status = 'active'
          RETURNING id
        `;
        if (closedA.length > 0) txnUpdates++;

        // Close Player B on Team B
        const closedB = await sql`
          UPDATE player_history
          SET status = 'swapped', end_date = ${date}, end_reason = 'swap', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
          WHERE player_id = ${playerB_Code} AND team_id = ${txn.team_b_id} AND status = 'active'
          RETURNING id
        `;
        if (closedB.length > 0) txnUpdates++;

        // Add swapped active contracts if not already present
        const existsA = await sql`
          SELECT id FROM player_history WHERE player_id = ${playerA_Code} AND team_id = ${txn.team_b_id} AND season_id = ${txn.season_id || 'SSPSLS16'} AND status = 'active'
        `;
        if (existsA.length === 0) {
          await sql`
            INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
            VALUES (${playerA_Code}, ${txn.player_a_name}, ${txn.team_b_id}, ${txn.team_b_name || 'Unknown Team'}, ${txn.season_id || 'SSPSLS16'}, 'swap', ${txn.fee_team_b || 0}, 'active', ${date}, ${txn.season_id || 'SSPSLS16'}, ${txn.season_id || 'SSPSLS16'})
          `;
          txnCreates++;
        }

        const existsB = await sql`
          SELECT id FROM player_history WHERE player_id = ${playerB_Code} AND team_id = ${txn.team_a_id} AND season_id = ${txn.season_id || 'SSPSLS16'} AND status = 'active'
        `;
        if (existsB.length === 0) {
          await sql`
            INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
            VALUES (${playerB_Code}, ${txn.player_b_name}, ${txn.team_a_id}, ${txn.team_a_name || 'Unknown Team'}, ${txn.season_id || 'SSPSLS16'}, 'swap', ${txn.fee_team_a || 0}, 'active', ${date}, ${txn.season_id || 'SSPSLS16'}, ${txn.season_id || 'SSPSLS16'})
          `;
          txnCreates++;
        }
      }
    }

    // Process transfers and releases
    for (const txn of txns) {
      const pId = txn.metadata?.player_id || txn.player_id || '';
      const pCode = idToCode.get(pId.toString()) || pId.toString().toLowerCase();
      const pName = txn.metadata?.player_name || txn.player_name || idToName.get(pId.toString()) || 'Unknown Player';
      const date = getJsDate(txn.created_at);

      if (txn.transaction_type === 'release') {
        const closed = await sql`
          UPDATE player_history
          SET status = 'released', end_date = ${date}, end_reason = 'release', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
          WHERE player_id = ${pCode} AND team_id = ${txn.team_id} AND status = 'active'
          RETURNING id
        `;
        if (closed.length > 0) txnUpdates++;
      } 
      else if (txn.transaction_type === 'transfer' || txn.transaction_type === 'player_transfer') {
        const oldTeamId = txn.old_team_id || txn.team_id;
        const newTeamId = txn.new_team_id;

        if (oldTeamId) {
          const closed = await sql`
            UPDATE player_history
            SET status = 'transferred', end_date = ${date}, end_reason = 'transfer', contract_end_season = ${txn.season_id || 'SSPSLS16'}, updated_at = NOW()
            WHERE player_id = ${pCode} AND team_id = ${oldTeamId} AND status = 'active'
            RETURNING id
          `;
          if (closed.length > 0) txnUpdates++;
        }

        if (newTeamId) {
          const exists = await sql`
            SELECT id FROM player_history WHERE player_id = ${pCode} AND team_id = ${newTeamId} AND season_id = ${txn.season_id || 'SSPSLS16'} AND status = 'active'
          `;
          if (exists.length === 0) {
            await sql`
              INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
              VALUES (${pCode}, ${pName}, ${newTeamId}, 'Unknown Team', ${txn.season_id || 'SSPSLS16'}, 'transfer', ${txn.amount || txn.cost_to_new_team || 0}, 'active', ${date}, ${txn.season_id || 'SSPSLS16'}, ${txn.season_id || 'SSPSLS16'})
            `;
            txnCreates++;
          }
        }
      }
    }

    console.log(`Transaction timeline sync: Created ${txnCreates} move logs, updated/closed ${txnUpdates} active logs.`);

    // 4. Final step: Align active rosters to match the last record in player_history
    console.log("\n=== 4. CONNECTING ACTIVE ROSTERS TO LAST PLAYER HISTORY RECORD ===");
    const finalHistory = await sql`
      SELECT DISTINCT ON (player_id, season_id) *
      FROM player_history
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ORDER BY player_id, season_id, acquisition_date DESC, id DESC
    `;
    console.log(`Found ${finalHistory.length} latest player history endpoints.`);

    let rosterAligns = 0;
    let rosterCreates = 0;

    for (const hist of finalHistory) {
      const numId = codeToId.get(hist.player_id.toLowerCase()) || hist.player_id;
      
      // Look up current roster row
      const rosterRows = await sql`
        SELECT * FROM team_players WHERE player_id = ${numId} AND season_id = ${hist.season_id}
      `;

      if (hist.status === 'active') {
        if (rosterRows.length === 0) {
          console.log(`[NEW ROSTER ASSIGNMENT] ${hist.player_name} -> team ${hist.team_id} (based on active history timeline)`);
          await sql`
            INSERT INTO team_players (team_id, player_id, season_id, purchase_price, acquired_at, created_at, updated_at)
            VALUES (${hist.team_id}, ${numId}, ${hist.season_id}, ${hist.acquisition_value || 0}, ${hist.acquisition_date || 'NOW()'}, NOW(), NOW())
          `;
          rosterCreates++;
        } else if (rosterRows[0].team_id !== hist.team_id) {
          console.log(`[ROSTER REALIGNMENT] ${hist.player_name}: shifting roster from team ${rosterRows[0].team_id} to active history team ${hist.team_id}`);
          await sql`
            UPDATE team_players
            SET team_id = ${hist.team_id}, purchase_price = ${hist.acquisition_value || 0}, updated_at = NOW()
            WHERE id = ${rosterRows[0].id}
          `;
          rosterAligns++;
        }
      } else {
        // Status is released, swapped, or transferred (meaning they shouldn't be active on this roster)
        if (rosterRows.length > 0 && rosterRows[0].team_id === hist.team_id) {
          console.log(`[ROSTER REMOVAL] ${hist.player_name}: removing roster row from team ${hist.team_id} (history status is "${hist.status}")`);
          await sql`DELETE FROM team_players WHERE id = ${rosterRows[0].id}`;
          rosterAligns++;
        }
      }
    }

    console.log(`Roster alignment results: Created ${rosterCreates} roster rows, aligned/removed ${rosterAligns} roster rows.`);
    console.log("\n=== ALIGNMENT AND ROUTEMAPPING COMPLETED SUCCESSFULLY ===");

  } catch (err) {
    console.error(err);
  }
}

alignDatabase();
