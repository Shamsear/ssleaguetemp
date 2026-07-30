const { neon } = require('@neondatabase/serverless');
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

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

// Decrypt encrypted bid data helper
function decryptBidData(encryptedData) {
  try {
    if (!encryptedData || !process.env.BID_ENCRYPTION_KEY) return null;
    const key = Buffer.from(process.env.BID_ENCRYPTION_KEY, 'hex');
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    return null;
  }
}

async function fixTimeline() {
  try {
    console.log("=== 1. DELETING S16 & S17 HISTORY TO START FRESH ===");
    await sql`DELETE FROM player_history WHERE season_id IN ('SSPSLS16', 'SSPSLS17')`;

    console.log("=== 2. FETCHING PLAYER MAPPINGS AND WINNING BIDS ===");
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

    // Fetch team names mapping from teams table
    const teamRows = await sql`SELECT id, name FROM teams`;
    const idToTeamName = new Map();
    teamRows.forEach(t => {
      idToTeamName.set(t.id, t.name);
    });

    const regWins = await sql`
      SELECT player_id, team_id, team_name, season_id, amount, actual_bid_amount, encrypted_bid_data, round_id, 'regular' as round_type
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

    // Map to keep track of each player's contract value (wage) keyed by playerCode purely
    const playerContractValues = new Map();

    // Process regular round wins to decrypt their bid amounts
    const processedRegWins = regWins.map(bid => {
      let price = bid.actual_bid_amount || 0;
      if (!price && bid.encrypted_bid_data) {
        const decrypted = decryptBidData(bid.encrypted_bid_data);
        if (decrypted && decrypted.amount) {
          price = decrypted.amount;
        }
      }
      const numId = bid.player_id.toString();
      const code = idToCode.get(numId) || numId;
      playerContractValues.set(code.toLowerCase(), price);

      return {
        ...bid,
        price
      };
    });

    // Process bulk wins and store prices
    bulkWins.forEach(bid => {
      const numId = bid.player_id.toString();
      const code = idToCode.get(numId) || numId;
      playerContractValues.set(code.toLowerCase(), bid.price || 10);
    });

    const allWins = [...processedRegWins, ...bulkWins];

    // INJECT DIOGO COSTA (player ID 20) S16 AUCTION WIN FROM FIRESTORE
    console.log("-> Injecting S16 auction win for Diogo Costa ($510)");
    allWins.push({
      player_id: '20',
      team_id: 'SSPSLT0023',
      team_name: idToTeamName.get('SSPSLT0023') || 'Kopites',
      season_id: 'SSPSLS16',
      round_id: 'SSPSLFR00011',
      round_type: 'regular',
      price: 510
    });
    playerContractValues.set('127038', 510);

    console.log("=== 3. CREATING CHRONOLOGICALLY CORRECT STARTING HISTORY ENTRIES ===");
    let createdHistory = 0;
    for (const win of allWins) {
      const numId = win.player_id.toString();
      const code = idToCode.get(numId) || win.player_id;
      const playerName = idToName.get(numId) || `Player ${numId}`;
      const teamName = idToTeamName.get(win.team_id) || win.team_name || 'Unknown Team';
      
      // Starting date at the beginning of the season
      const startDate = win.season_id === 'SSPSLS16' ? new Date('2025-11-20T12:00:00Z') : new Date('2026-03-01T12:00:00Z');
      
      await sql`
        INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
        VALUES (${code}, ${playerName}, ${win.team_id}, ${teamName}, ${win.season_id}, ${win.round_type === 'bulk' ? 'bulk' : 'auction'}, ${win.price || 0}, 'active', ${startDate}, ${win.season_id}, ${win.season_id})
      `;
      createdHistory++;
    }
    console.log(`Created ${createdHistory} starting player_history records.`);

    console.log("\n=== 4. PROCESSING TRANSACTION TIMELINE MOVES FROM FIREBASE ===");
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

    // Sort transactions by date so they apply in order
    const allTxns = [
      ...playerTxns.map(t => ({ ...t, _source: 'player_transactions', _date: getJsDate(t.created_at || t.date) })),
      ...txns.map(t => ({ ...t, _source: 'transactions', _date: getJsDate(t.created_at) }))
    ].sort((a, b) => a._date - b._date);

    for (const txn of allTxns) {
      const date = txn._date;
      const seasonId = txn.season_id || 'SSPSLS16';
      
      if (txn.transaction_type === 'swap') {
        const playerA_Code = txn.player_a_id ? txn.player_a_id.toString().toLowerCase() : '';
        const playerB_Code = txn.player_b_id ? txn.player_b_id.toString().toLowerCase() : '';
        
        console.log(`Swap: ${txn.player_a_name} ↔ ${txn.player_b_name} on ${date.toISOString().split('T')[0]}`);

        // Close active history for A on A's old team
        const closedA = await sql`
          UPDATE player_history
          SET status = 'swapped', end_date = ${date}, end_reason = 'swap', contract_end_season = ${seasonId}, updated_at = NOW()
          WHERE player_id = ${playerA_Code} AND team_id = ${txn.team_a_id} AND status = 'active'
          RETURNING id
        `;
        if (closedA.length > 0) txnUpdates++;

        // Close active history for B on B's old team
        const closedB = await sql`
          UPDATE player_history
          SET status = 'swapped', end_date = ${date}, end_reason = 'swap', contract_end_season = ${seasonId}, updated_at = NOW()
          WHERE player_id = ${playerB_Code} AND team_id = ${txn.team_b_id} AND status = 'active'
          RETURNING id
        `;
        if (closedB.length > 0) txnUpdates++;

        // Retrieve player A's contract value (wage) to carry over
        const valA = playerContractValues.get(playerA_Code) || 0;
        // Retrieve player B's contract value (wage) to carry over
        const valB = playerContractValues.get(playerB_Code) || 0;

        const teamNameA = idToTeamName.get(txn.team_a_id) || txn.team_a_name || 'Unknown Team';
        const teamNameB = idToTeamName.get(txn.team_b_id) || txn.team_b_name || 'Unknown Team';

        // Add new active history for A on B's team
        await sql`
          INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
          VALUES (${playerA_Code}, ${txn.player_a_name}, ${txn.team_b_id}, ${teamNameB}, ${seasonId}, 'swap', ${valA}, 'active', ${date}, ${seasonId}, ${seasonId})
        `;
        txnCreates++;

        // Add new active history for B on A's team
        await sql`
          INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
          VALUES (${playerB_Code}, ${txn.player_b_name}, ${txn.team_a_id}, ${teamNameA}, ${seasonId}, 'swap', ${valB}, 'active', ${date}, ${seasonId}, ${seasonId})
        `;
        txnCreates++;
      } 
      else if (txn.transaction_type === 'release') {
        const pId = txn.metadata?.player_id || txn.player_id || '';
        const pCode = idToCode.get(pId.toString()) || pId.toString().toLowerCase();
        const pName = txn.metadata?.player_name || txn.player_name || idToName.get(pId.toString()) || 'Unknown Player';
        
        console.log(`Release: ${pName} from team ${txn.team_id} on ${date.toISOString().split('T')[0]}`);
        const closed = await sql`
          UPDATE player_history
          SET status = 'released', end_date = ${date}, end_reason = 'release', contract_end_season = ${seasonId}, updated_at = NOW()
          WHERE player_id = ${pCode} AND team_id = ${txn.team_id} AND status = 'active'
          RETURNING id
        `;
        if (closed.length > 0) txnUpdates++;
      } 
      else if (txn.transaction_type === 'transfer' || txn.transaction_type === 'player_transfer') {
        const pId = txn.metadata?.player_id || txn.player_id || '';
        const pCode = idToCode.get(pId.toString()) || pId.toString().toLowerCase();
        const pName = txn.metadata?.player_name || txn.player_name || idToName.get(pId.toString()) || 'Unknown Player';
        const oldTeamId = txn.old_team_id || txn.team_id;
        const newTeamId = txn.new_team_id;

        console.log(`Transfer: ${pName} from ${oldTeamId} ↔ ${newTeamId} on ${date.toISOString().split('T')[0]}`);

        if (oldTeamId) {
          const closed = await sql`
            UPDATE player_history
            SET status = 'transferred', end_date = ${date}, end_reason = 'transfer', contract_end_season = ${seasonId}, updated_at = NOW()
            WHERE player_id = ${pCode} AND team_id = ${oldTeamId} AND status = 'active'
            RETURNING id
          `;
          if (closed.length > 0) txnUpdates++;
        }

        if (newTeamId) {
          // Retrieve original contract value to carry over
          const val = playerContractValues.get(pCode) || txn.amount || txn.cost_to_new_team || 0;
          const teamNameNew = idToTeamName.get(newTeamId) || 'Unknown Team';
          
          await sql`
            INSERT INTO player_history (player_id, player_name, team_id, team_name, season_id, acquisition_type, acquisition_value, status, acquisition_date, contract_start_season, contract_end_season)
            VALUES (${pCode}, ${pName}, ${newTeamId}, ${teamNameNew}, ${seasonId}, 'transfer', ${val}, 'active', ${date}, ${seasonId}, ${seasonId})
          `;
          txnCreates++;
        }
      }
    }

    console.log(`Transaction timeline sync: Created ${txnCreates} logs, updated/closed ${txnUpdates} logs.`);

    console.log("\n=== 5. ALIGNING ACTIVE ROSTER ROWS ===");
    // Delete all roster entries for S16 and S17 and reconstruct based on the final active history states!
    await sql`DELETE FROM team_players WHERE season_id IN ('SSPSLS16', 'SSPSLS17')`;

    const finalActive = await sql`
      SELECT DISTINCT ON (player_id, season_id) *
      FROM player_history
      WHERE season_id IN ('SSPSLS16', 'SSPSLS17')
      ORDER BY player_id, season_id, acquisition_date DESC, id DESC
    `;

    let rosterCreates = 0;
    for (const hist of finalActive) {
      if (hist.status === 'active') {
        const numId = codeToId.get(hist.player_id.toLowerCase()) || hist.player_id;
        console.log(`[ROSTER ASSIGN] ${hist.player_name} -> team ${hist.team_id} (acquisition value: ${hist.acquisition_value})`);
        await sql`
          INSERT INTO team_players (team_id, player_id, season_id, purchase_price, acquired_at, created_at, updated_at)
          VALUES (${hist.team_id}, ${numId}, ${hist.season_id}, ${hist.acquisition_value || 0}, ${hist.acquisition_date}, NOW(), NOW())
        `;
        rosterCreates++;
      }
    }
    console.log(`Reconstructed active rosters: Created ${rosterCreates} rows in team_players.`);

    console.log("\n=== 6. CLOSING ACTIVE CONTRACTS FOR FREE AGENTS ===");
    // Fetch all current virtual players and their statuses
    const currentVirtuals = await sql`SELECT id, player_id, team_id, status FROM footballplayers`;
    const virtualStatusMap = new Map(); // player_id (code) -> status/team
    currentVirtuals.forEach(v => {
      if (v.player_id) {
        const code = v.player_id.toString().toLowerCase();
        virtualStatusMap.set(code, { status: v.status, team_id: v.team_id });
      }
    });

    const activeHistoryRecords = await sql`
      SELECT id, player_id, team_id, season_id 
      FROM player_history 
      WHERE status = 'active' AND season_id IN ('SSPSLS16', 'SSPSLS17')
    `;

    let closedFreeAgents = 0;
    for (const record of activeHistoryRecords) {
      const pCode = record.player_id ? record.player_id.toString().toLowerCase() : '';
      const current = virtualStatusMap.get(pCode);
      
      // If the player is currently a free agent in footballplayers, they are released
      if (current && (current.status === 'free_agent' || !current.team_id)) {
        // Set end_date to end of season S16/S17 or NOW
        const releaseDate = record.season_id === 'SSPSLS16' ? new Date('2026-02-28T23:59:59Z') : new Date('2026-07-29T23:59:59Z');
        await sql`
          UPDATE player_history
          SET status = 'released', end_date = ${releaseDate}, end_reason = 'release', contract_end_season = ${record.season_id}, updated_at = NOW()
          WHERE id = ${record.id}
        `;
        closedFreeAgents++;
      }
    }
    console.log(`Closed active contracts for ${closedFreeAgents} free agents.`);

  } catch (err) {
    console.error(err);
  }
}
fixTimeline();
