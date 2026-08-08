import { neon } from '@neondatabase/serverless';
import { decryptBidData } from '@/lib/encryption';
import { adminDb } from '@/lib/firebase/admin';
import { logTransaction } from '@/lib/transaction-logger';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

export interface ReplacementCandidate {
  player_id: string;
  player_name: string;
  position: string;
  position_group: string;
  base_price: number;
  status: string;
  winning_team_id: string | null;
  winning_bid: number | null;
  club: string | null;
  overall_rating: number | null;
  is_sold: boolean;
  current_team_id: string | null;
  team_bid_amount: number | null;
  has_team_bid: boolean;
}

export interface ReplacementInfo {
  originalPlayer: {
    player_id: string;
    player_name: string;
    position: string;
    purchase_price: number;
    team_id: string;
    acquired_at: string;
  };
  round: {
    id: string;
    round_number: number | null;
    position: string | null;
    round_type: string | null;
    status: string | null;
  };
  candidates: ReplacementCandidate[];
}

/**
 * Get details of a won player, their round, the team's bids, and replacement candidates
 */
export async function getReplacementInfo(
  playerId: string,
  seasonId: string,
  search?: string
): Promise<ReplacementInfo> {
  // 1. Get the player's assignment details
  const assignment = await sql`
    SELECT tp.*, fp.name as player_name, fp.position
    FROM team_players tp
    JOIN footballplayers fp ON tp.player_id = fp.id
    WHERE tp.player_id = ${playerId} AND tp.season_id = ${seasonId}
    LIMIT 1
  `;
  
  if (assignment.length === 0) {
    throw new Error('Player not found or not assigned to any team in this season');
  }
  
  const playerAssignment = assignment[0];
  const roundId = playerAssignment.round_id;
  const teamId = playerAssignment.team_id;
  
  if (!roundId) {
    throw new Error('This player assignment does not have a round ID');
  }
  
  // 2. Fetch the round details
  const roundResult = await sql`
    SELECT * FROM rounds WHERE id = ${roundId} LIMIT 1
  `;
  if (roundResult.length === 0) {
    throw new Error('Round not found for this player assignment');
  }
  const round = roundResult[0];
  
  // 3. Fetch all bids placed by this team in this round
  const teamBidsResult = await sql`
    SELECT * FROM bids 
    WHERE round_id = ${roundId} AND team_id = ${teamId}
  `;
  
  const teamBids: { player_id: string; amount: number; status: string }[] = [];
  for (const bid of teamBidsResult) {
    try {
      const decrypted = decryptBidData(bid.encrypted_bid_data);
      teamBids.push({
        player_id: decrypted.player_id,
        amount: decrypted.amount,
        status: bid.status
      });
    } catch (err) {
      console.error(`Failed to decrypt bid ${bid.id}:`, err);
    }
  }
  
  // 4. Fetch the candidates
  let roundPlayersResult;
  
  if (round.round_type === 'bulk') {
    if (search && search.trim() !== '') {
      // Search from round players
      roundPlayersResult = await sql`
        SELECT rp.player_id, rp.player_name, rp.position, rp.position_group, rp.base_price, rp.status, rp.winning_team_id, rp.winning_bid,
               fp.club, fp.overall_rating, fp.is_sold, fp.team_id as current_team_id
        FROM round_players rp
        JOIN footballplayers fp ON rp.player_id = fp.id
        WHERE rp.round_id = ${roundId} AND rp.player_name ILIKE ${'%' + search + '%'}
        LIMIT 50
      `;
    } else {
      // If no search in bulk round, only return players that this team actually bid on
      const bidPlayerIds = teamBids.map(b => b.player_id);
      if (bidPlayerIds.length > 0) {
        roundPlayersResult = await sql`
          SELECT rp.player_id, rp.player_name, rp.position, rp.position_group, rp.base_price, rp.status, rp.winning_team_id, rp.winning_bid,
                 fp.club, fp.overall_rating, fp.is_sold, fp.team_id as current_team_id
          FROM round_players rp
          JOIN footballplayers fp ON rp.player_id = fp.id
          WHERE rp.round_id = ${roundId} AND rp.player_id = ANY(${bidPlayerIds})
        `;
      } else {
        roundPlayersResult = [];
      }
    }
  } else {
    // Normal round - return all active players of the round's position group
    const basePosition = round.position ? round.position.split('-')[0] : '';
    roundPlayersResult = await sql`
      SELECT 
        fp.id as player_id, 
        fp.name as player_name, 
        fp.position, 
        fp.position_group, 
        10 as base_price,
        CASE WHEN fp.is_sold THEN 'sold' ELSE 'pending' END as status,
        fp.team_id as winning_team_id,
        fp.acquisition_value as winning_bid,
        fp.club, 
        fp.overall_rating, 
        fp.is_sold, 
        fp.team_id as current_team_id
      FROM footballplayers fp
      WHERE fp.position = ${basePosition}
        AND (fp.retired IS NOT TRUE)
      ORDER BY fp.overall_rating DESC NULLS LAST
    `;
  }
  
  // Combine round players with the team's bids
  const candidates: ReplacementCandidate[] = roundPlayersResult.map((player: any) => {
    const teamBid = teamBids.find(b => b.player_id === player.player_id);
    return {
      player_id: player.player_id,
      player_name: player.player_name,
      position: player.position,
      position_group: player.position_group,
      base_price: player.base_price,
      status: player.status,
      winning_team_id: player.winning_team_id,
      winning_bid: player.winning_bid,
      club: player.club,
      overall_rating: player.overall_rating,
      is_sold: player.is_sold,
      current_team_id: player.current_team_id,
      team_bid_amount: teamBid ? teamBid.amount : null,
      has_team_bid: !!teamBid
    };
  });
  
  return {
    originalPlayer: {
      player_id: playerAssignment.player_id,
      player_name: playerAssignment.player_name,
      position: playerAssignment.position,
      purchase_price: playerAssignment.purchase_price,
      team_id: playerAssignment.team_id,
      acquired_at: playerAssignment.acquired_at
    },
    round: {
      id: round.id,
      round_number: round.round_number,
      position: round.position,
      round_type: round.round_type,
      status: round.status
    },
    candidates
  };
}

/**
 * Perform the transactional player replacement in database
 */
export async function executePlayerReplacement(params: {
  originalPlayerId: string;
  replacementPlayerId: string;
  teamId: string;
  seasonId: string;
  newPrice: number;
  adminUser: { uid: string; email: string; username?: string };
}): Promise<{ success: boolean; message: string }> {
  const { originalPlayerId, replacementPlayerId, teamId, seasonId, newPrice, adminUser } = params;
  
  // 1. Fetch original player and assignment details
  const origAssignment = await sql`
    SELECT tp.*, fp.name as player_name, fp.position
    FROM team_players tp
    JOIN footballplayers fp ON tp.player_id = fp.id
    WHERE tp.player_id = ${originalPlayerId} AND tp.season_id = ${seasonId} AND tp.team_id = ${teamId}
    LIMIT 1
  `;
  if (origAssignment.length === 0) {
    throw new Error('Original player assignment not found for this team');
  }
  const original = origAssignment[0];
  const roundId = original.round_id;
  const oldPrice = original.purchase_price;
  const oldPosition = original.position;
  
  // 2. Fetch replacement player details
  const repPlayerResult = await sql`
    SELECT * FROM footballplayers WHERE id = ${replacementPlayerId} LIMIT 1
  `;
  if (repPlayerResult.length === 0) {
    throw new Error('Replacement player not found');
  }
  const replacementPlayer = repPlayerResult[0];
  const newPosition = replacementPlayer.position;
  
  // Verify replacement player is NOT sold in this season
  const isSoldResult = await sql`
    SELECT * FROM team_players 
    WHERE player_id = ${replacementPlayerId} AND season_id = ${seasonId}
    LIMIT 1
  `;
  if (isSoldResult.length > 0) {
    throw new Error(`Replacement player ${replacementPlayer.name} is already owned by another team in this season`);
  }
  
  try {
    // 3. Execute Neon database modifications
    
    // Remove original player
    await sql`
      DELETE FROM team_players 
      WHERE player_id = ${originalPlayerId} AND season_id = ${seasonId}
    `;
    
    await sql`
      UPDATE footballplayers 
      SET is_sold = false, team_id = null, team_name = null, acquisition_value = null, status = null, round_id = null
      WHERE id = ${originalPlayerId}
    `;
    
    if (roundId) {
      await sql`
        UPDATE round_players 
        SET status = 'unsold', winning_team_id = null, winning_bid = null
        WHERE round_id = ${roundId} AND player_id = ${originalPlayerId}
      `;
    }
    
    // Assign replacement player
    await sql`
      INSERT INTO team_players (team_id, player_id, season_id, round_id, purchase_price, acquired_at)
      VALUES (${teamId}, ${replacementPlayerId}, ${seasonId}, ${roundId || null}, ${newPrice}, NOW())
    `;
    
    const teamRes = await sql`SELECT name FROM teams WHERE id = ${teamId} AND season_id = ${seasonId} LIMIT 1`;
    const teamName = teamRes[0]?.name || teamId;
    
    await sql`
      UPDATE footballplayers 
      SET is_sold = true, team_id = ${teamId}, team_name = ${teamName}, acquisition_value = ${newPrice}, 
          season_id = ${seasonId}, round_id = ${roundId || null}, status = 'active', 
          contract_start_season = ${seasonId}, contract_end_season = ${seasonId}, contract_length = 1, updated_at = NOW()
      WHERE id = ${replacementPlayerId}
    `;
    
    if (roundId) {
      const rpExists = await sql`
        SELECT id FROM round_players 
        WHERE round_id = ${roundId} AND player_id = ${replacementPlayerId}
        LIMIT 1
      `;
      if (rpExists.length > 0) {
        await sql`
          UPDATE round_players 
          SET status = 'sold', winning_team_id = ${teamId}, winning_bid = ${newPrice}
          WHERE round_id = ${roundId} AND player_id = ${replacementPlayerId}
        `;
      } else {
        const posGroup = replacementPlayer.position_group || '';
        await sql`
          INSERT INTO round_players (round_id, season_id, player_id, player_name, position, position_group, base_price, status, winning_team_id, winning_bid)
          VALUES (${roundId}, ${seasonId}, ${replacementPlayerId}, ${replacementPlayer.name}, ${newPosition || ''}, ${posGroup}, 10, 'sold', ${teamId}, ${newPrice})
        `;
      }
    }
    
    // Update Neon team budget
    const priceDiff = newPrice - oldPrice;
    await sql`
      UPDATE teams 
      SET 
        football_spent = football_spent + ${priceDiff},
        football_budget = football_budget - ${priceDiff},
        updated_at = NOW()
      WHERE id = ${teamId} AND season_id = ${seasonId}
    `;
    
    // 4. Update Firestore team_season budget and counts
    const tsId = `${teamId}_${seasonId}`;
    const tsRef = adminDb.collection('team_seasons').doc(tsId);
    const tsDoc = await tsRef.get();
    
    if (tsDoc.exists) {
      const tsd = tsDoc.data();
      const curr = tsd?.currency_system || 'single';
      
      const posCounts = tsd?.position_counts || {};
      if (oldPosition && oldPosition in posCounts) {
        posCounts[oldPosition] = Math.max(0, (posCounts[oldPosition] || 0) - 1);
      }
      if (newPosition) {
        posCounts[newPosition] = (posCounts[newPosition] || 0) + 1;
      }
      
      const upd: any = {
        total_spent: (tsd?.total_spent || 0) + priceDiff,
        position_counts: posCounts,
        updated_at: new Date()
      };
      
      if (curr === 'dual') {
        const currentFb = tsd?.football_budget || 0;
        upd.football_budget = currentFb - priceDiff;
        upd.football_spent = (tsd?.football_spent || 0) + priceDiff;
      } else {
        const currentB = tsd?.budget || 0;
        upd.budget = currentB - priceDiff;
      }
      
      await tsRef.update(upd);
    }
    
    // 5. Update Firestore transaction log
    try {
      const teamOwnerUid = tsDoc.exists ? tsDoc.data()?.user_id : null;
      if (teamOwnerUid) {
        const txnsSnapshot = await adminDb.collection('transactions')
          .where('userId', '==', teamOwnerUid)
          .where('seasonId', '==', seasonId)
          .where('type', '==', 'auction_win')
          .get();
          
        for (const doc of txnsSnapshot.docs) {
          const m = doc.data().metadata || {};
          if (m.playerId === originalPlayerId && m.roundId === roundId) {
            await doc.ref.delete();
            console.log(`🗑️ Deleted transaction document ${doc.id} for player ${original.player_name}`);
          }
        }
        
        await logTransaction({
          userId: teamOwnerUid,
          team_id: teamId,
          seasonId: seasonId,
          transaction_type: 'auction_win',
          amount: -newPrice,
          description: `Auction Win (Replacement): ${replacementPlayer.name}`,
          metadata: {
            playerId: replacementPlayerId,
            playerName: replacementPlayer.name,
            roundId: roundId,
            replacedPlayerId: originalPlayerId,
            replacedPlayerName: original.player_name
          }
        });
      }
    } catch (txnErr) {
      console.error('Failed to update transactions in Firestore:', txnErr);
    }
    
    // 6. Log audit action
    try {
      const { logAuditAction } = await import('@/lib/audit-logger');
      await logAuditAction({
        action_type: 'apply_pending_allocations',
        user_id: adminUser.uid,
        user_email: adminUser.email,
        resource_type: 'player',
        resource_id: replacementPlayerId,
        season_id: seasonId,
        description: `Replaced won player ${original.player_name} (price: ${oldPrice}) with ${replacementPlayer.name} (price: ${newPrice}) for team ${teamName}`,
        metadata: {
          team_id: teamId,
          team_name: teamName,
          round_id: roundId,
          original_player_id: originalPlayerId,
          original_player_name: original.player_name,
          original_price: oldPrice,
          replacement_player_id: replacementPlayerId,
          replacement_player_name: replacementPlayer.name,
          replacement_price: newPrice
        }
      });
    } catch (auditErr) {
      console.error('Failed to log audit action:', auditErr);
    }
    
    return {
      success: true,
      message: `Successfully replaced ${original.player_name} with ${replacementPlayer.name} for team ${teamName}.`
    };
    
  } catch (err: any) {
    console.error('Replacement transaction failed:', err);
    throw new Error(err.message || 'Failed to replace player');
  }
}
