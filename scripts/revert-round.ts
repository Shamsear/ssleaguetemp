import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { adminDb } from '../lib/firebase/admin';
import { decryptBidData } from '../lib/encryption';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

async function revertRound(roundId: string) {
  try {
    console.log(`\n🔄 Starting reversion of finalization for round: ${roundId}`);

    // 1. Get round details
    const roundResult = await sql`
      SELECT id, season_id, status, position, round_number
      FROM rounds
      WHERE id = ${roundId}
    `;

    if (roundResult.length === 0) {
      console.error('❌ Round not found.');
      return;
    }

    const round = roundResult[0];
    const seasonId = round.season_id;
    console.log(`📍 Round details: Number ${round.round_number}, Position ${round.position}, Season ID ${seasonId}, Current Status: ${round.status}`);

    // 2. Get resolved tiebreakers for this round
    const resolvedTiebreakers = await sql`
      SELECT player_id, winning_team_id, winning_bid
      FROM tiebreakers
      WHERE round_id = ${roundId} AND status = 'resolved'
    `;
    console.log(`ℹ️ Found ${resolvedTiebreakers.length} resolved tiebreakers. These allocations will be preserved.`);

    // 3. Get all allocations currently in team_players for this round
    const allocations = await sql`
      SELECT team_id, player_id, purchase_price
      FROM team_players
      WHERE round_id = ${roundId}
    `;
    console.log(`📊 Found ${allocations.length} total allocations in team_players for this round.`);

    let revertedCount = 0;

    for (const alloc of allocations) {
      const isTiebreakerWinner = resolvedTiebreakers.some(
        tb => tb.player_id === alloc.player_id && tb.winning_team_id === alloc.team_id
      );

      if (isTiebreakerWinner) {
        console.log(`✓ Preserving tiebreaker win: Player ${alloc.player_id} -> Team ${alloc.team_id}`);
        continue;
      }

      console.log(`\n⏳ Reverting allocation: Player ${alloc.player_id} -> Team ${alloc.team_id} (Price: ${alloc.purchase_price})`);

      // A. Delete from team_players
      await sql`
        DELETE FROM team_players
        WHERE round_id = ${roundId} AND player_id = ${alloc.player_id} AND team_id = ${alloc.team_id}
      `;
      console.log(`  - Deleted from team_players`);

      // B. Update footballplayers: set is_sold = false, team_id = null, etc.
      await sql`
        UPDATE footballplayers
        SET is_sold = false,
            team_id = null,
            acquisition_value = null,
            round_id = null,
            status = null,
            contract_start_season = null,
            contract_end_season = null,
            contract_length = null,
            updated_at = NOW()
        WHERE id = ${alloc.player_id}
      `;
      console.log(`  - Reset player status in footballplayers`);

      // C. Update Postgres teams: subtract spent, add budget, decrement count
      await sql`
        UPDATE teams
        SET football_spent = football_spent - ${alloc.purchase_price},
            football_budget = football_budget + ${alloc.purchase_price},
            football_players_count = football_players_count - 1,
            updated_at = NOW()
        WHERE id = ${alloc.team_id} AND season_id = ${seasonId}
      `;
      console.log(`  - Reverted Postgres team budget counters`);

      // D. Update Firebase team_seasons
      const tsId = `${alloc.team_id}_${seasonId}`;
      const tsRef = adminDb.collection('team_seasons').doc(tsId);
      const tsDoc = await tsRef.get();
      if (tsDoc.exists) {
        const tsd = tsDoc.data();
        const curr = tsd?.currency_system || 'single';
        const positionCounts = tsd?.position_counts || {};

        // Find the player's position to decrement the count
        const playerRes = await sql`SELECT position FROM footballplayers WHERE id = ${alloc.player_id}`;
        const pos = playerRes[0]?.position;
        if (pos && pos in positionCounts) {
          positionCounts[pos] = Math.max(0, (positionCounts[pos] || 1) - 1);
        }

        const upd: any = {
          total_spent: Math.max(0, (tsd?.total_spent || 0) - alloc.purchase_price),
          players_count: Math.max(0, (tsd?.players_count || 1) - 1),
          position_counts: positionCounts,
          updated_at: new Date()
        };

        if (curr === 'dual') {
          upd.football_budget = (tsd?.football_budget || 0) + alloc.purchase_price;
          upd.football_spent = Math.max(0, (tsd?.football_spent || 0) - alloc.purchase_price);
        } else {
          upd.budget = (tsd?.budget || 0) + alloc.purchase_price;
        }

        await tsRef.update(upd);
        console.log(`  - Reverted Firebase team_seasons document`);
      }

      revertedCount++;
    }

    // 4. Revert Bids in Postgres
    const bidsResult = await sql`
      SELECT id, team_id, encrypted_bid_data
      FROM bids
      WHERE round_id = ${roundId}
    `;

    console.log(`\n⏳ Resetting status for ${bidsResult.length} bids...`);
    for (const bid of bidsResult) {
      let playerId = '';
      try {
        const decrypted = decryptBidData(bid.encrypted_bid_data);
        playerId = decrypted.player_id;
      } catch {}

      const isTiebreakerWinner = resolvedTiebreakers.some(
        tb => tb.player_id === playerId && tb.winning_team_id === bid.team_id
      );

      if (isTiebreakerWinner) {
        await sql`
          UPDATE bids
          SET status = 'won', updated_at = NOW()
          WHERE id = ${bid.id}
        `;
      } else {
        await sql`
          UPDATE bids
          SET status = 'active', actual_bid_amount = null, phase = null, updated_at = NOW()
          WHERE id = ${bid.id}
        `;
      }
    }
    console.log(`✓ Bid statuses updated successfully`);

    // 5. Update round status back to 'expired'
    await sql`
      UPDATE rounds
      SET status = 'expired', updated_at = NOW()
      WHERE id = ${roundId}
    `;
    console.log(`✓ Round status set to 'expired'`);

    console.log(`\n🎉 Reversion complete! Reverted ${revertedCount} regular allocations. Round is ready to be finalized again.`);
  } catch (error) {
    console.error('❌ Reversion failed:', error);
  }
}

// Get roundId from command-line arguments
const args = process.argv.slice(2);
const roundId = args[0];

if (!roundId) {
  console.error('Please provide a roundId. Example: npx tsx scripts/revert-round.ts <roundId>');
  process.exit(1);
}

revertRound(roundId);
